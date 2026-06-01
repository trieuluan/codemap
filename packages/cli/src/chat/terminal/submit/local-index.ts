import path from "node:path";

import type { DebugLogger } from "../../../agent/core/debug-logger.js";
import {
  buildLocalIndex,
  refreshLocalFile,
  removeLocalFile,
} from "@codemap/core/lib/local-index.js";

function extractEditedPath(
  toolName: string,
  argsText: string,
): string | null {
  if (
    ![
      "write_file",
      "string_replace_lsp",
      "ast_smart_edit",
      "delete_file",
    ].includes(toolName)
  )
    return null;
  try {
    const args = JSON.parse(argsText) as { path?: unknown };
    return typeof args.path === "string" && args.path.trim()
      ? args.path.trim()
      : null;
  } catch {
    return null;
  }
}

export interface SubmitLocalIndexTracker {
  recordToolResult(toolName: string, argsText: string): void;
}

export function createSubmitLocalIndexTracker(
  logger: DebugLogger | null,
): SubmitLocalIndexTracker {
  let fullIndexRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const dirtyLocalIndexPaths = new Set<string>();

  const scheduleFullLocalIndexRefresh = () => {
    if (fullIndexRefreshTimer) clearTimeout(fullIndexRefreshTimer);
    fullIndexRefreshTimer = setTimeout(() => {
      fullIndexRefreshTimer = null;
      void buildLocalIndex().catch((error: unknown) => {
        logger?.logDebugInfo({
          event: "local_index_refresh_failed",
          error: String(error),
        });
      });
    }, 3_000);
  };

  return {
    recordToolResult(toolName, argsText) {
      const editedPath = extractEditedPath(toolName, argsText);
      if (!editedPath) return;

      const relativePath = path.isAbsolute(editedPath)
        ? path.relative(process.cwd(), editedPath)
        : editedPath;
      if (relativePath.startsWith("..")) return;

      dirtyLocalIndexPaths.add(relativePath);
      const isDelete = toolName === "delete_file";
      const refresh = isDelete
        ? removeLocalFile(relativePath).then((removed: boolean) => removed)
        : refreshLocalFile(relativePath).then((updated: boolean) => updated);
      void refresh
        .then((changed: boolean) => {
          if (changed) scheduleFullLocalIndexRefresh();
        })
        .catch((error: unknown) => {
          logger?.logDebugInfo({
            event: isDelete
              ? "local_file_remove_failed"
              : "local_file_refresh_failed",
            filePath: relativePath,
            error: String(error),
          });
        });
    },
  };
}
