import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerWriteFileTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "write_file",
    {
      title: "Write File",
      description:
        "Write content to a file, creating it if it doesn't exist. " +
        "Overwrites the entire file. For targeted edits, use edit_file instead.",
      inputSchema: {
        file_path: z
          .string()
          .describe("The absolute path to the file."),
        content: z
          .string()
          .describe("The full content to write."),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Show what would be written without writing. Default: false.",
          ),
      },
    },
    withToolError(async ({ file_path, content, dry_run }) => {
      const workspacePath = await readWorkspacePath();
      const absPath = resolve(workspacePath, file_path);

      // Check if file exists (for reporting)
      let exists = false;
      let oldContent: string | null = null;
      try {
        oldContent = await readFile(absPath, "utf-8");
        exists = true;
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }

      const result = {
        applied: false,
        dryRun: Boolean(dry_run),
        filePath: file_path,
        created: !exists,
        bytesWritten: Buffer.byteLength(content, "utf-8"),
      };

      if (dry_run) {
        const preview = exists
          ? `### Dry Run — would overwrite existing file (${result.bytesWritten} bytes)\n\n` +
            `Current size: ${Buffer.byteLength(oldContent!, "utf-8")} bytes`
          : `### Dry Run — would create new file\n\n` +
            `Size: ${result.bytesWritten} bytes`;

        return success(preview, result);
      }

      // Ensure parent directory exists
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content, "utf-8");
      result.applied = true;

      return success(
        `### File ${exists ? "Written" : "Created"}\n\n` +
          `File: \`${file_path}\`\n` +
          `Size: ${result.bytesWritten} bytes`,
        result,
      );
    }),
  );
}
