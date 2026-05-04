import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";

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
    withToolError(async ({ patch, base64_patch, reverse, dry_run, fuzz, project_id }) => {
      // Decode base64 patch if provided
      let patchContent = patch;

      if (base64_patch && !patchContent) {
        try {
          patchContent = Buffer.from(base64_patch, "base64").toString("utf-8");
        } catch (error) {
          return success(
            "Failed to decode base64 patch.\n" +
              "Ensure the base64_patch is valid encoded content.",
            {
              projectId: project_id,
              error: "invalid_base64",
              applied: false,
            },
          );
        }
      }

      if (!patchContent) {
        return success(
          "No patch content provided. " +
            "Provide either 'patch' or 'base64_patch'.",
          {
            projectId: project_id,
            error: "missing_patch",
            applied: false,
          },
        );
      }

      // In a real implementation, this would:
      // 1. Validate the patch format
      // 2. Check for patch conflicts
      // 3. Apply the patch using git or patch command
      // 4. Return success/error status

      const result = {
        projectId: project_id,
        applied: false,
        dryRun: dry_run,
        reverse: reverse,
        filesModified: [],
        conflicts: [],
        output: "",
        note: "This is a placeholder implementation. Real implementation would call 'patch' command or use a diff library.",
      };

      if (dry_run) {
        result.note = "Dry run - no changes would be applied.";
        return success(
          "### Dry Run Result\n\n" +
            "In dry-run mode, the patch would be validated but not applied.\n" +
            "If this were a real application:\n" +
            "- Patches would be validated for format\n" +
            "- Conflicts would be detected before applying\n" +
            "- Files would be modified in place",
          result,
        );
      }

      return success(
        "### Apply Patch Result\n\n" +
          "This is a placeholder implementation. Real implementation would:\n" +
          "1. Decode the patch (if base64)\n" +
          "2. Parse the unified diff format\n" +
          "3. Check for existing changes that might conflict\n" +
          "4. Apply the patch using `patch -p0 < file.patch` or similar\n" +
          "5. Return detailed results of what was modified",
        result,
      );
    }),
  );
}
