import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { uuidSchema } from "../lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

interface ApplyPatchResult {
  applied: boolean;
  dryRun: boolean;
  reverse: boolean;
  requiresConfirmation: boolean;
  confirmed: boolean;
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
  conflicts: string[];
  output: string;
  workspacePath: string;
  patchFormat: "unified" | "base64" | "unknown";
  stripLevel: number;
  preflightOutput?: string;
  patchPreview?: string;
  [key: string]: unknown;
}

async function createTempPatchFile(content: string): Promise<string> {
  const filename = join(tmpdir(), `codemap-patch-${randomUUID()}.patch`);
  await writeFile(filename, content, "utf-8");
  return filename;
}

async function removeTempPatchFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Best-effort cleanup; do not mask patch results.
  }
}

function buildPatchArgs(options: {
  stripLevel: number;
  fuzz: number;
  patchFile: string;
  dryRun?: boolean;
  reverse?: boolean;
}): string[] {
  const args = [`-p${options.stripLevel}`];
  if (options.dryRun) args.push("--dry-run");
  args.push("--fuzz", String(options.fuzz), "-i", options.patchFile);
  if (options.reverse) args.push("-R");
  return args;
}

function runPatch(
  args: string[],
  cwd: string,
  timeout: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("patch", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d));
    child.stderr.on("data", (d: Buffer) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`patch timed out after ${timeout}ms`));
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      const err = new Error(
        `patch exited with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`,
      );
      (err as any).stdout = stdout;
      (err as any).stderr = stderr;
      (err as any).code = code;
      reject(err);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeDiffPath(path: string, stripLevel: number): string {
  const cleaned = path.replace(/^"|"$/g, "").replace(/\t.*$/, "").trim();
  if (cleaned === "/dev/null") return cleaned;
  const parts = cleaned.split("/").filter(Boolean);
  return parts.slice(Math.min(stripLevel, parts.length)).join("/") || cleaned;
}

function parsePatchChanges(
  patchContent: string,
  stripLevel: number,
  reverse: boolean,
): {
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
} {
  const filesModified: string[] = [];
  const filesCreated: string[] = [];
  const filesDeleted: string[] = [];
  const lines = patchContent.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    if (
      !lines[i].startsWith("--- ") ||
      i + 1 >= lines.length ||
      !lines[i + 1].startsWith("+++ ")
    )
      continue;

    const oldPath = normalizeDiffPath(lines[i].slice(4), stripLevel);
    const newPath = normalizeDiffPath(lines[i + 1].slice(4), stripLevel);
    const createsFile = reverse
      ? newPath === "/dev/null"
      : oldPath === "/dev/null";
    const deletesFile = reverse
      ? oldPath === "/dev/null"
      : newPath === "/dev/null";
    const targetPath = reverse ? oldPath : newPath;
    const sourcePath = reverse ? newPath : oldPath;

    if (createsFile) filesCreated.push(targetPath);
    else if (deletesFile) filesDeleted.push(sourcePath);
    else filesModified.push(targetPath);
  }

  return {
    filesModified: unique(filesModified),
    filesCreated: unique(filesCreated),
    filesDeleted: unique(filesDeleted),
  };
}

function parsePatchOutput(output: string): {
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
  conflicts: string[];
} {
  const filesModified: string[] = [];
  const filesCreated: string[] = [];
  const filesDeleted: string[] = [];
  const conflicts: string[] = [];
  for (const line of output.split("\n")) {
    if (line.startsWith("patching file "))
      filesModified.push(line.replace("patching file ", "").trim());
    else if (line.includes("new file")) {
      const match = line.match(/\+\+\+ b\/(.+)/);
      if (match) filesCreated.push(match[1].trim());
    } else if (line.includes("deleted file")) {
      const match = line.match(/--- a\/(.+)/);
      if (match) filesDeleted.push(match[1].trim());
    } else if (line.includes("Hunk") && line.includes("FAILED")) {
      const match = line.match(/file (.+)/);
      conflicts.push(match ? match[1].trim() : line.trim());
    } else if (line.includes("reject")) {
      const match = line.match(/saving rejects to file (.+)/);
      conflicts.push(match ? match[1].trim() : line.trim());
    }
  }
  return {
    filesModified: unique(filesModified),
    filesCreated: unique(filesCreated),
    filesDeleted: unique(filesDeleted),
    conflicts: unique(conflicts),
  };
}

function truncatePatchPreview(patchContent: string, maxChars = 12_000): string {
  if (patchContent.length <= maxChars) return patchContent;
  return `${patchContent.slice(0, maxChars)}\n...\n[patch preview truncated: ${patchContent.length - maxChars} more character(s)]`;
}

function formatFileList(label: string, files: string[]): string {
  if (files.length === 0) return `${label}: 0`;
  return `${label}: ${files.length}\n${files.map((file) => `  - ${file}`).join("\n")}`;
}

function formatPatchPreviewMessage(result: ApplyPatchResult): string {
  const changedCount =
    result.filesModified.length +
    result.filesCreated.length +
    result.filesDeleted.length;
  const mode = result.dryRun ? "Dry run preview" : "Confirmation preview";
  const reason = result.dryRun
    ? "Not applied because dry_run=true."
    : "Not applied because confirm_apply=true was not provided.";
  const next = result.dryRun
    ? "To apply this patch, call apply_patch again with dry_run=false and confirm_apply=true."
    : "To apply this patch, call apply_patch again with confirm_apply=true.";

  return (
    `### Patch Preview - Preflight passed\n\n` +
    `Mode: ${mode}\n` +
    `Applied: no\n` +
    `Reason: ${reason}\n` +
    `Requires confirmation to apply: ${result.requiresConfirmation ? "yes" : "no"}\n` +
    `Next: ${next}\n` +
    `Files touched: ${changedCount}\n` +
    `${formatFileList("Changed", result.filesModified)}\n` +
    `${formatFileList("Created", result.filesCreated)}\n` +
    `${formatFileList("Deleted", result.filesDeleted)}\n\n` +
    (result.preflightOutput
      ? `Preflight output:\n\`\`\`\n${result.preflightOutput}\n\`\`\`\n\n`
      : "") +
    (result.patchPreview
      ? `Patch preview:\n\`\`\`diff\n${result.patchPreview}\n\`\`\``
      : "")
  );
}

function extractPatchError(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.message];
    const e = error as any;
    if (e.stdout) parts.push(`stdout: ${e.stdout}`);
    if (e.stderr) parts.push(`stderr: ${e.stderr}`);
    return parts.join("\n");
  }
  return String(error);
}

function detectPatchFormat(
  patchContent: string,
): "unified" | "base64" | "unknown" {
  if (
    patchContent.includes("--- a/") ||
    patchContent.includes("+++ b/") ||
    patchContent.includes("--- /dev/null") ||
    patchContent.includes("+++ /dev/null") ||
    patchContent.includes("diff --git") ||
    patchContent.includes("@@ -")
  ) {
    return "unified";
  }
  return "unknown";
}

function decodeBase64Patch(input: string): string | null {
  const sanitized = input.replace(/[\r\n\s]/g, "");
  if (sanitized.length === 0 || sanitized.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(sanitized)) return null;
  const decoded = Buffer.from(sanitized, "base64");
  if (decoded.toString("base64") !== sanitized) return null;
  return decoded.toString("utf-8");
}

export function registerApplyPatchTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "apply_patch",
    {
      title: "Apply Patch",
      description:
        "Preview or apply a unified diff patch after a successful dry-run preflight. " +
        "By default, apply_patch returns a diff preview and requires confirm_apply=true before modifying files. " +
        "Supports raw unified diffs and base64-encoded patches.",
      inputSchema: {
        patch: z
          .string()
          .optional()
          .describe(
            "Unified diff patch content to apply. Provide either patch or base64_patch, not both.",
          ),
        base64_patch: z
          .string()
          .optional()
          .describe(
            "Base64-encoded unified diff patch. Provide either patch or base64_patch, not both.",
          ),
        base64Patch: z
          .string()
          .optional()
          .describe("Alias for base64_patch. Prefer base64_patch."),
        reverse: z
          .boolean()
          .optional()
          .default(false)
          .describe("Apply patch in reverse (undo changes). Default: false."),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Show what would be changed without applying. Default: false.",
          ),
        dryRun: z
          .boolean()
          .optional()
          .describe("Alias for dry_run. Prefer dry_run."),
        confirm_apply: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Required to actually modify files. If false, returns a preview even when dry_run is false.",
          ),
        confirmApply: z
          .boolean()
          .optional()
          .describe("Alias for confirm_apply. Prefer confirm_apply."),
        fuzz: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .default(2)
          .describe("Set fuzz factor for patch application. Default: 2."),
        strip_level: z
          .number()
          .int()
          .min(0)
          .max(10)
          .optional()
          .default(1)
          .describe(
            "Path strip level passed to patch as -pN. Use 1 for git diffs with a/ and b/ prefixes, 0 for plain paths. Default: 1.",
          ),
        stripLevel: z
          .number()
          .int()
          .min(0)
          .max(10)
          .optional()
          .describe("Alias for strip_level. Prefer strip_level."),
        project_id: uuidSchema
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
      },
    },
    withToolError(async (args) => {
      const { patch, reverse, fuzz, project_id } = args;
      const camelArgs = args as {
        base64Patch?: string;
        dryRun?: boolean;
        confirmApply?: boolean;
        stripLevel?: number;
      };
      const base64_patch = args.base64_patch ?? camelArgs.base64Patch;
      const dry_run = args.dry_run === true || camelArgs.dryRun === true;
      const confirm_apply =
        args.confirm_apply === true || camelArgs.confirmApply === true;
      const strip_level = args.strip_level ?? camelArgs.stripLevel;

      if (patch && base64_patch) {
        return success(
          "Provide only one of 'patch' or 'base64_patch', not both.",
          {
            projectId: project_id,
            applied: false,
            error: "ambiguous_patch_input",
          },
        );
      }

      let patchContent = patch;
      let patchFormat: "unified" | "base64" | "unknown" = "unified";
      if (base64_patch) {
        const decoded = decodeBase64Patch(base64_patch);
        if (decoded === null) {
          return success("Failed to decode base64 patch.", {
            projectId: project_id,
            applied: false,
            error: "invalid_base64",
          });
        }
        patchContent = decoded;
        patchFormat = "base64";
      }

      if (!patchContent) {
        return success(
          "No patch content provided. Provide either 'patch' or 'base64_patch'.",
          { projectId: project_id, applied: false, error: "missing_patch" },
        );
      }

      const detected = detectPatchFormat(patchContent);
      if (detected === "unknown") {
        return success("Patch content does not look like a unified diff.", {
          projectId: project_id,
          applied: false,
          error: "invalid_patch_format",
          patchFormat: detected,
        });
      }

      const workspacePath = await readWorkspacePath();
      const stripLevel = strip_level ?? 1;
      const fuzzFactor = fuzz ?? 2;
      const reversePatch = Boolean(reverse);
      const confirmed = Boolean(confirm_apply);
      const parsedChanges = parsePatchChanges(
        patchContent,
        stripLevel,
        reversePatch,
      );
      const result: ApplyPatchResult = {
        applied: false,
        dryRun: Boolean(dry_run),
        reverse: reversePatch,
        requiresConfirmation: !confirmed,
        confirmed,
        filesModified: parsedChanges.filesModified,
        filesCreated: parsedChanges.filesCreated,
        filesDeleted: parsedChanges.filesDeleted,
        conflicts: [],
        output: "",
        workspacePath,
        patchFormat,
        stripLevel,
        patchPreview: truncatePatchPreview(patchContent),
      };

      const patchFile = await createTempPatchFile(patchContent);
      try {
        const dryArgs = buildPatchArgs({
          stripLevel,
          fuzz: fuzzFactor,
          patchFile,
          dryRun: true,
          reverse: reversePatch,
        });
        const dry = await runPatch(dryArgs, workspacePath, 10_000);
        result.preflightOutput = dry.stdout + dry.stderr;
        result.output = result.preflightOutput;

        if (dry_run || !confirmed) {
          return success(formatPatchPreviewMessage(result), result);
        }

        const applyArgs = buildPatchArgs({
          stripLevel,
          fuzz: fuzzFactor,
          patchFile,
          reverse: reversePatch,
        });
        const applied = await runPatch(applyArgs, workspacePath, 10_000);
        result.output = applied.stdout + applied.stderr;
        result.applied = true;
        result.requiresConfirmation = false;
        Object.assign(result, {
          ...parsePatchOutput(result.output),
          conflicts: [],
        });
        const reparsedChanges = parsePatchChanges(
          patchContent,
          stripLevel,
          reversePatch,
        );
        result.filesModified = reparsedChanges.filesModified.length
          ? reparsedChanges.filesModified
          : result.filesModified;
        result.filesCreated = reparsedChanges.filesCreated.length
          ? reparsedChanges.filesCreated
          : result.filesCreated;
        result.filesDeleted = reparsedChanges.filesDeleted.length
          ? reparsedChanges.filesDeleted
          : result.filesDeleted;
      } catch (error) {
        const errOutput = extractPatchError(error);
        result.output = errOutput;
        result.conflicts.push(errOutput);
        result.applied = false;
      } finally {
        await removeTempPatchFile(patchFile);
      }

      if (result.applied) {
        const modifiedCount =
          result.filesModified.length +
          result.filesCreated.length +
          result.filesDeleted.length;
        return success(
          `### Patch Applied Successfully\n\n` +
            `Modified: ${modifiedCount} file(s)\n` +
            `  - Changed: ${result.filesModified.length}\n` +
            `  - Created: ${result.filesCreated.length}\n` +
            `  - Deleted: ${result.filesDeleted.length}\n\n` +
            (result.output ? `\`\`\`\n${result.output}\n\`\`\`` : ""),
          result,
        );
      }

      return success(
        `### Patch Application Failed\n\n` +
          `Preflight prevented applying changes. Conflicts/errors: ${result.conflicts.length}\n\n` +
          (result.output ? `\`\`\`\n${result.output}\n\`\`\`` : ""),
        result,
      );
    }),
  );
}
