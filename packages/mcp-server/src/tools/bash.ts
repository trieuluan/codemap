import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";
import { execa } from "execa";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 4_000;
const TAIL_CHARS = 500; // chars to keep from end when truncating

const SOURCE_EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|py|json|yaml|yml|md|css|html|xml|sh|toml|rs|go|rb|swift|cs|cpp|c|vue|kt|java|php)$/;

function detectFileWrite(command: string): string | null {
  // Python pathlib / open write
  if (/\.write_text\s*\(/.test(command)) return "Detected Python Path.write_text() — file modification via bash is not allowed.";
  if (/open\s*\([^)]*['"]\s*w\s*['"]/.test(command)) return "Detected Python open(..., 'w') — file modification via bash is not allowed.";
  if (/\.write\s*\(/.test(command) && /pathlib|Path\(|open\(/.test(command)) return "Detected Python file write — file modification via bash is not allowed.";

  // Node.js fs writes
  if (/fs\.(writeFile|writeFileSync|appendFile|appendFileSync)\s*\(/.test(command)) return "Detected Node.js fs.writeFile — file modification via bash is not allowed.";

  // awk output redirect to source file
  if (/\bawk\b.+>\s*\S+/.test(command) && SOURCE_EXTS.test(command)) return "Detected awk redirect to source file — use edit_file instead.";

  // Shell redirect writing to source files: cmd > file.ts or cmd >> file.ts
  const redirectMatch = command.match(/(?:^|;|\|)\s*[^|>]*>+\s*(\S+)/m);
  if (redirectMatch) {
    const target = redirectMatch[1] ?? "";
    if (SOURCE_EXTS.test(target) && !target.startsWith("/dev/")) {
      return `Detected shell redirect to source file '${target}' — use edit_file or write_file instead.`;
    }
  }

  // tee to source file
  const teeMatch = command.match(/\btee\s+(\S+)/);
  if (teeMatch && SOURCE_EXTS.test(teeMatch[1] ?? "")) return `Detected tee to source file '${teeMatch[1]}' — use write_file instead.`;

  return null;
}

export function registerBashTool(server: McpServer, _config: McpServerConfig) {
  server.registerTool(
    "bash",
    {
      title: "Run Shell Command",
      description:
        "Execute a shell command in the workspace root directory. " +
        "Use for: running builds, tests, git commands, package installs, linting, file operations, or any shell task. " +
        "Commands run with bash -c in the workspace root. " +
        "stdout and stderr are captured and returned together. " +
        "Non-zero exit codes are returned as errors with the output included. " +
        "Prefer specific tools (run_tests, edit_file, etc.) when available — use bash for tasks those tools don't cover.",
      inputSchema: {
        command: z
          .string()
          .min(1)
          .max(4000)
          .describe("Shell command to execute, e.g. 'npm run build', 'git log --oneline -10', 'ls -la src/'"),
        timeout_ms: z
          .number()
          .int()
          .min(1000)
          .max(MAX_TIMEOUT_MS)
          .optional()
          .describe(`Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}. Max: ${MAX_TIMEOUT_MS}.`),
        cwd: z
          .string()
          .optional()
          .describe(
            "Working directory relative to workspace root. Defaults to workspace root. " +
            "Example: 'packages/api' to run in a sub-package.",
          ),
      },
    },
    withToolError(async ({ command, timeout_ms, cwd: cwdArg }) => {
      const fileWriteViolation = detectFileWrite(command);
      if (fileWriteViolation) {
        return success(
          `[BLOCKED] ${fileWriteViolation}\n\nUse edit_file(file_path, old_string, new_string) for targeted edits, or write_file(file_path, content) for new files. Do NOT use bash/python/sed to modify source files.`,
          { exitCode: 1, stdout: "", stderr: fileWriteViolation, blocked: true },
        );
      }

      const workspaceRoot = await readWorkspacePath();
      const resolvedCwd = cwdArg
        ? `${workspaceRoot}/${cwdArg.replace(/^\//, "")}`
        : workspaceRoot;

      const timeoutMs = Math.min(timeout_ms ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

      let stdout = "";
      let stderr = "";
      let exitCode = 0;

      try {
        const result = await execa("bash", ["-c", command], {
          cwd: resolvedCwd,
          timeout: timeoutMs,
          all: true,
          reject: false,
          env: { ...process.env, FORCE_COLOR: "0" },
        });

        stdout = result.stdout ?? "";
        stderr = result.stderr ?? "";
        exitCode = result.exitCode ?? 0;
      } catch (err: unknown) {
        const e = err as { timedOut?: boolean; stdout?: string; stderr?: string; exitCode?: number };
        if (e.timedOut) {
          return success(
            `Command timed out after ${timeoutMs}ms: ${command}`,
            { exitCode: -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "", timedOut: true },
          );
        }
        stdout = e.stdout ?? "";
        stderr = e.stderr ?? "";
        exitCode = e.exitCode ?? 1;
      }

      const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
      let truncated = combined;
      if (combined.length > MAX_OUTPUT_CHARS) {
        const head = combined.slice(0, MAX_OUTPUT_CHARS - TAIL_CHARS);
        const tail = combined.slice(-TAIL_CHARS);
        const omitted = combined.length - MAX_OUTPUT_CHARS;
        truncated = `${head}\n... [${omitted} chars omitted] ...\n${tail}`;
      }

      const summary = exitCode === 0
        ? `$ ${command}\n${truncated || "(no output)"}`
        : `$ ${command}\nExit code: ${exitCode}\n${truncated || "(no output)"}`;

      return success(summary, { exitCode, stdout, stderr });
    }),
  );
}
