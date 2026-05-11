import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

// ─── types ───────────────────────────────────────────────────────────────────

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
  [key: string]: unknown;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function createTempPatchFile(content: string): Promise<string> {
  const filename = join(tmpdir(), `codemap-patch-${randomUUID()}.patch`);
  await writeFile(filename, content, "utf-8");
  return filename;
}

/** Spawn `patch` with stdin ignored (prevents interactive prompt on BSD/macOS). */
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
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(
          `patch exited with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`,
        );
        (err as any).stdout = stdout;
        (err as any).stderr = stderr;
        (err as any).code = code;
        reject(err);
      }
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

  const lines = output.split("\n");

  for (const line of lines) {
    // Parse patch output like "patching file path/to/file.ts"
    if (line.startsWith("patching file ")) {
      const filePath = line.replace("patching file ", "").trim();
      filesModified.push(filePath);
    } else if (line.includes("new file")) {
      // Extract from diff headers
      const match = line.match(/\+\+\+ b\/(.+)/);
      if (match) {
        filesCreated.push(match[1].trim());
      }
    } else if (line.includes("deleted file")) {
      const match = line.match(/--- a\/(.+)/);
      if (match) {
        filesDeleted.push(match[1].trim());
      }
    } else if (line.includes("Hunk") && line.includes("FAILED")) {
      // Conflict detected
      const match = line.match(/file (.+)/);
      if (match) {
        conflicts.push(match[1].trim());
      }
    } else if (line.includes("reject")) {
      const match = line.match(/saving rejects to file (.+)/);
      if (match) {
        conflicts.push(match[1].trim());
      }
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
  // Check for unified diff markers
  if (
    patchContent.includes("--- a/") ||
    patchContent.includes("--- /dev/null") ||
    patchContent.includes("diff --git") ||
    patchContent.includes("@@ -")
  ) {
    return "unified";
  }

  // Check if it looks like base64
  if (/^[A-Za-z0-9+/=]+$/.test(patchContent.trim())) {
    return "base64";
  }

  return "unknown";
}

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerApplyPatchTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "apply_patch",
    {
      title: "Apply Patch",
      description:
        "Apply a patch or diff to the workspace. " +
        "Supports both unified diff format and base64-encoded patches. " +
        "The patch is applied using the standard `patch` command or " +
        "programmatic diff application. " +
        "Warning: This modifies files in your workspace!",
      inputSchema: {
        patch: z
          .string()
          .optional()
          .describe(
            "Unified diff patch content to apply. " +
              "Either patch or base64_patch must be provided.",
          ),
        base64_patch: z
          .string()
          .optional()
          .describe(
            "Base64-encoded patch content. " +
              "Either patch or base64_patch must be provided.",
          ),
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
        fuzz: z
          .number()
          .optional()
          .default(2)
          .describe(
            "Set fuzz factor for patch application. Default: 2.",
          ),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(
      async ({ patch, base64_patch, reverse, dry_run, fuzz, project_id }) => {
        // Decode base64 patch if provided
        let patchContent = patch;

        if (base64_patch && !patchContent) {
          try {
            // Sanitize base64: remove line endings that corrupt decode
            const sanitized = base64_patch.replace(/[\r\n\s]/g, "");
            patchContent = Buffer.from(sanitized, "base64").toString("utf-8");
          } catch (error) {
            return success("Failed to decode base64 patch.", {
              projectId: project_id,
              applied: false,
              error: "invalid_base64",
            });
          }
        }

        if (!patchContent) {
          return success(
            "No patch content provided. Provide either 'patch' or 'base64_patch'.",
            {
              projectId: project_id,
              applied: false,
              error: "missing_patch",
            },
          );
        }

        const workspacePath = await readWorkspacePath();
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
          patchFormat: detectPatchFormat(patchContent),
        };

        // Dry run mode
        if (dry_run) {
          try {
            const patchFile = await createTempPatchFile(patchContent);
            const args = ["-p1", "--dry-run", "--fuzz", String(fuzz ?? 2), "-i", patchFile];
            if (reverse) args.push("-R");

            const { stdout, stderr } = await runPatch(args, workspacePath, 10_000);

            result.output = stdout + stderr;
            const parsed = parsePatchOutput(result.output);
            result.filesModified = parsed.filesModified;
            result.filesCreated = parsed.filesCreated;
            result.filesDeleted = parsed.filesDeleted;
            result.conflicts = parsed.conflicts;
          } catch (error) {
            const errOutput = extractPatchError(error);
            result.conflicts.push(errOutput);
            result.output = errOutput;
          }

          return success(
            result.conflicts.length > 0
              ? `### Dry Run Result — ${result.conflicts.length} conflict(s) found\n\n${result.output}`
              : `### Dry Run Result — Patch would apply cleanly\n\n${result.output}`,
            result,
          );
        }

        // Real apply mode
        try {
          const patchFile = await createTempPatchFile(patchContent);
          const args = ["-p1", "--fuzz", String(fuzz ?? 2), "-i", patchFile];
          if (reverse) args.push("-R");

          const { stdout, stderr } = await runPatch(args, workspacePath, 10_000);

          result.output = stdout + stderr;
          result.applied = true;

          const parsed = parsePatchOutput(result.output);
          result.filesModified = parsed.filesModified;
          result.filesCreated = parsed.filesCreated;
          result.filesDeleted = parsed.filesDeleted;
          result.conflicts = parsed.conflicts;
        } catch (error) {
          const errOutput = extractPatchError(error);

          // Check if it's a conflict vs other error
          if (
            errOutput.includes("FAILED") ||
            errOutput.includes("reject") ||
            errOutput.includes("Hunk")
          ) {
            result.conflicts.push(errOutput);
            result.output = errOutput;
            result.applied = false;
          } else {
            throw error; // Re-throw unexpected errors
          }
        }

        // Clean up temp file will be handled by OS (tmpdir),
        // but in production you'd want to use fs.unlinkSync() to remove it immediately

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
        } else {
          return success(
            `### Patch Application Failed\n\n` +
              `Conflicts: ${result.conflicts.length}\n\n` +
              (result.output ? `\`\`\`\n${result.output}\n\`\`\`` : ""),
            result,
          );
        }
      },
    ),
  );
}
