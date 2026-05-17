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
