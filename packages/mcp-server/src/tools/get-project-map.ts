import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { ProjectMapSnapshot, ProjectMapTreeNode } from "../lib/api-types.js";

function countNodes(node: ProjectMapTreeNode): { files: number; dirs: number } {
  if (node.type === "file") return { files: 1, dirs: 0 };
  let files = 0;
  let dirs = 0;
  for (const child of node.children ?? []) {
    const counts = countNodes(child);
    files += counts.files;
    dirs += counts.dirs;
  }
  return { files, dirs: dirs + 1 };
}

function findSubtree(
  node: ProjectMapTreeNode,
  folderPath: string,
): ProjectMapTreeNode | null {
  const normalized = folderPath.replace(/\/$/, "");
  if (node.path === normalized || node.name === normalized) return node;
  for (const child of node.children ?? []) {
    const found = findSubtree(child, normalized);
    if (found) return found;
  }
  return null;
}

function renderTree(
  node: ProjectMapTreeNode,
  indent: string,
  lines: string[],
): void {
  const isDir = node.type === "directory";
  lines.push(`${indent}${node.name}${isDir ? "/" : ""}`);

  if (isDir) {
    const children = [...(node.children ?? [])].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of children) {
      renderTree(child, indent + "  ", lines);
    }
  }
}

export function registerGetProjectMapTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "get_project_map",
    {
      title: "Get Project Map",
      description:
        "Returns the file tree of a CodeMap project as an indented directory listing. " +
        "Use this to understand the project structure before diving into specific files. " +
        "Optionally filter to a sub-folder or limit depth to reduce output size. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
        folder: z
          .string()
          .optional()
          .describe(
            "Show only this sub-folder, e.g. 'src/components'. Omit for the full tree.",
          ),
      },
    },
    withToolError(async ({ project_id, folder }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Run create_project first to link this workspace to a CodeMap project.";

        return success(summary, {
          projectId: null,
          available: false,
          folder: folder ?? null,
          snapshot: null,
          counts: { files: 0, dirs: 0 },
          tree: null,
        });
      }

      let snapshot: ProjectMapSnapshot;

      try {
        snapshot = await client.request<ProjectMapSnapshot>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map`,
          { authRequired: true },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("404")) {
          const summary =
            `Project not found or not yet imported: ${resolvedProjectId}\n` +
            "Run trigger_reimport to index the project first.";

          return success(summary, {
            projectId: resolvedProjectId,
            available: false,
            folder: folder ?? null,
            snapshot: null,
            counts: { files: 0, dirs: 0 },
            tree: null,
          });
        }

        throw error;
      }

      let root = snapshot.tree;

      if (folder) {
        const subtree = findSubtree(root, folder);
        if (!subtree) {
          const summary =
            `Folder not found: ${folder}\n` +
            "Check the path and make sure it exists in the project.";

          return success(summary, {
            projectId: resolvedProjectId,
            available: true,
            folder,
            snapshot: {
              id: snapshot.id,
              importId: snapshot.importId,
              createdAt: snapshot.createdAt,
              updatedAt: snapshot.updatedAt,
            },
            counts: { files: 0, dirs: 0 },
            tree: null,
          });
        }
        root = subtree;
      }

      const { files, dirs } = countNodes(root);
      const snapshotDate = new Date(snapshot.createdAt).toLocaleString();

      const lines: string[] = [
        `Project map — snapshot from ${snapshotDate}`,
        `${files} file${files !== 1 ? "s" : ""}, ${dirs} director${dirs !== 1 ? "ies" : "y"}`,
        "",
      ];

      renderTree(root, "", lines);

      return success(lines.join("\n"), {
        projectId: resolvedProjectId,
        available: true,
        folder: folder ?? null,
        snapshot: {
          id: snapshot.id,
          importId: snapshot.importId,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        },
        counts: { files, dirs },
        tree: root,
      });
    }),
  );
}
