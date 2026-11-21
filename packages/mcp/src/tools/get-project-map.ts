import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureLocalIndexWithSummary } from "@codemap-ai/core/lib/local-index.js";
import { success, withToolError } from "@codemap-ai/core/lib/tool-response.js";

interface TreeNode {
  dirs: Map<string, TreeNode>;
  files: string[];
}

function insertPath(root: TreeNode, parts: string[]): void {
  let curr = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const dir = parts[i]!;
    let next = curr.dirs.get(dir);
    if (!next) {
      next = { dirs: new Map(), files: [] };
      curr.dirs.set(dir, next);
    }
    curr = next;
  }
  const fileName = parts[parts.length - 1];
  if (fileName) curr.files.push(fileName);
}

function renderTree(
  node: TreeNode,
  depth: number,
  maxDepth: number,
  indent: string,
  lines: string[],
): void {
  const dirNames = [...node.dirs.keys()].sort((a, b) => a.localeCompare(b));
  for (const dir of dirNames) {
    const child = node.dirs.get(dir)!;
    if (depth >= maxDepth) {
      lines.push(`${indent}${dir}/ (...)`);
      continue;
    }
    lines.push(`${indent}${dir}/`);
    renderTree(child, depth + 1, maxDepth, `${indent}  `, lines);
  }
  const files = [...node.files].sort((a, b) => a.localeCompare(b));
  for (const f of files) {
    lines.push(`${indent}${f}`);
  }
}

export function registerGetProjectMapTool(server: McpServer) {
  server.registerTool(
    "get_project_map",
    {
      title: "Get Project Map",
      description:
        "Returns the file tree of the local workspace from the SQLite index. Use folder and max_depth to keep output compact.",
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe("Sub-folder prefix, e.g. 'src/components'. Omit for workspace root."),
        max_depth: z
          .number()
          .int()
          .min(1)
          .max(12)
          .optional()
          .default(4)
          .describe("Maximum directory depth to expand (default: 4)."),
        max_lines: z
          .number()
          .int()
          .min(20)
          .max(1000)
          .optional()
          .default(250)
          .describe("Maximum output lines to keep token usage low (default: 250)."),
      },
    },
    withToolError(async ({ folder, max_depth, max_lines }) => {
      const { store } = await ensureLocalIndexWithSummary();
      const allPaths = store.getAllFilePaths();

      const prefix = folder ? folder.replace(/^\/+|\/+$/g, "") : "";
      const filtered = prefix
        ? allPaths.filter((p) => p === prefix || p.startsWith(`${prefix}/`))
        : allPaths;

      const root: TreeNode = { dirs: new Map(), files: [] };
      for (const filePath of filtered) {
        const rel = prefix && filePath.startsWith(`${prefix}/`)
          ? filePath.slice(prefix.length + 1)
          : filePath;
        const parts = rel.split("/").filter(Boolean);
        if (parts.length > 0) insertPath(root, parts);
      }

      const lines: string[] = [];
      if (prefix) lines.push(`${prefix}/`);
      renderTree(root, 1, max_depth, prefix ? "  " : "", lines);

      const truncated = lines.length > max_lines;
      const shownLines = truncated ? lines.slice(0, max_lines) : lines;
      const footer = truncated
        ? `\n... (${lines.length - max_lines} more lines omitted — pass folder="..." or higher max_lines)`
        : "";

      const header = `Project map (${filtered.length} files${prefix ? ` under ${prefix}` : ""}, max_depth=${max_depth}):`;
      return success(`${header}\n\n${shownLines.join("\n")}${footer}`, {
        folder: prefix || null,
        fileCount: filtered.length,
        maxDepth: max_depth,
        truncated,
      });
    }),
  );
}
