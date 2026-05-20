import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

interface ApplyPatchResult {
  applied: boolean;
  dryRun: boolean;
  reverse: boolean;
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];
  conflicts: string[];
  output: string;
  workspacePath: string;
  patchFormat: "unified" | "base64" | "unknown";
  stripLevel: number;
  preflightOutput?: string;
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

function runPatch(args: string[], cwd: string, timeout: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("patch", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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
      const err = new Error(`patch exited with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`);
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
    if (line.startsWith("patching file ")) filesModified.push(line.replace("patching file ", "").trim());
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
  return { filesModified, filesCreated, filesDeleted, conflicts };
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

function detectPatchFormat(patchContent: string): "unified" | "base64" | "unknown" {
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
        "Apply a unified diff patch to the workspace after a successful dry-run preflight. " +
        "Supports raw unified diffs and base64-encoded patches. " +
        "Warning: This modifies files in your workspace unless dry_run is true!",
      inputSchema: {
        patch: z.string().optional().describe("Unified diff patch content to apply. Provide either patch or base64_patch, not both."),
        base64_patch: z.string().optional().describe("Base64-encoded unified diff patch. Provide either patch or base64_patch, not both."),
        reverse: z.boolean().optional().default(false).describe("Apply patch in reverse (undo changes). Default: false."),
        dry_run: z.boolean().optional().default(false).describe("Show what would be changed without applying. Default: false."),
        fuzz: z.number().int().min(0).max(100).optional().default(2).describe("Set fuzz factor for patch application. Default: 2."),
        strip_level: z.number().int().min(0).max(10).optional().default(1).describe("Path strip level passed to patch as -pN. Use 1 for git diffs with a/ and b/ prefixes, 0 for plain paths. Default: 1."),
        project_id: z.string().uuid().optional().describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(
      async ({ patch, base64_patch, reverse, dry_run, fuzz, strip_level, project_id }) => {
        if (patch && base64_patch) {
          return success("Provide only one of 'patch' or 'base64_patch', not both.", { projectId: project_id, applied: false, error: "ambiguous_patch_input" });
        }

        let patchContent = patch;
        let patchFormat: "unified" | "base64" | "unknown" = "unified";
        if (base64_patch) {
          const decoded = decodeBase64Patch(base64_patch);
          if (decoded === null) {
            return success("Failed to decode base64 patch.", { projectId: project_id, applied: false, error: "invalid_base64" });
          }
          patchContent = decoded;
          patchFormat = "base64";
        }

        if (!patchContent) {
          return success("No patch content provided. Provide either 'patch' or 'base64_patch'.", { projectId: project_id, applied: false, error: "missing_patch" });
        }

        const detected = detectPatchFormat(patchContent);
        if (detected === "unknown") {
          return success("Patch content does not look like a unified diff.", { projectId: project_id, applied: false, error: "invalid_patch_format", patchFormat: detected });
        }

        const workspacePath = await readWorkspacePath();
        const stripLevel = strip_level ?? 1;
        const fuzzFactor = fuzz ?? 2;
        const result: ApplyPatchResult = {
          applied: false,
          dryRun: Boolean(dry_run),
          reverse: Boolean(reverse),
          filesModified: [],
          filesCreated: [],
          filesDeleted: [],
          conflicts: [],
          output: "",
          workspacePath,
          patchFormat,
          stripLevel,
        };

        const patchFile = await createTempPatchFile(patchContent);
        try {
          const dryArgs = buildPatchArgs({ stripLevel, fuzz: fuzzFactor, patchFile, dryRun: true, reverse });
          const dry = await runPatch(dryArgs, workspacePath, 10_000);
          result.preflightOutput = dry.stdout + dry.stderr;

          if (dry_run) {
            result.output = result.preflightOutput;
            Object.assign(result, parsePatchOutput(result.output));
            return success(`### Dry Run Result — Patch would apply cleanly\n\n${result.output}`, result);
          }

          const applyArgs = buildPatchArgs({ stripLevel, fuzz: fuzzFactor, patchFile, reverse });
          const applied = await runPatch(applyArgs, workspacePath, 10_000);
          result.output = applied.stdout + applied.stderr;
          result.applied = true;
          Object.assign(result, parsePatchOutput(result.output));
        } catch (error) {
          const errOutput = extractPatchError(error);
          result.output = errOutput;
          result.conflicts.push(errOutput);
          result.applied = false;
        } finally {
          await removeTempPatchFile(patchFile);
        }

        if (result.applied) {
          const modifiedCount = result.filesModified.length + result.filesCreated.length + result.filesDeleted.length;
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
      },
    ),
  );
}
