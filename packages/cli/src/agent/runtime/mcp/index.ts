export interface MastraMcpServerStatus {
  name: string;
  connected: boolean;
  connecting?: boolean;
  toolCount: number;
  toolNames: string[];
  transport: "stdio" | "http";
  error?: string;
}

export interface MastraMcpSkippedServer {
  name: string;
  reason: string;
}

export interface MastraMcpConfigPaths {
  project: string;
  global: string;
  claude: string;
}

export interface MastraMcpStatusSummary {
  hasServers: boolean;
  statuses: MastraMcpServerStatus[];
  skipped: MastraMcpSkippedServer[];
  configPaths?: MastraMcpConfigPaths;
}

export interface MastraMcpInitResult {
  connected: MastraMcpServerStatus[];
  failed: MastraMcpServerStatus[];
  skipped: MastraMcpSkippedServer[];
  totalTools: number;
}

export interface MastraMcpManagerLike {
  initInBackground(): Promise<MastraMcpInitResult>;
  hasServers(): boolean;
  getServerStatuses(): MastraMcpServerStatus[];
  getSkippedServers(): MastraMcpSkippedServer[];
  getConfigPaths?(): MastraMcpConfigPaths;
  disconnect?(): Promise<void>;
}

export const MASTRA_DISABLED_TOOLS = [
  // Mastra-internal approval tool — tool approval is handled in the UI layer.
  "request_access",
  // Auth/setup flows are handled by built-in CLI /commands (/login, /logout,
  // /link, /create, /import, /projects). Hiding these keeps them off the
  // agent's tool list and prevents wasted turns on infrastructure concerns.
  "codemap_login",
  "codemap_check_auth_status",
  "codemap_logout",
  "codemap_link_project",
  "codemap_reimport",
  "codemap_create_project",
  "codemap_list_projects",
];

export function startMastraMcpInitialization(
  mcpManager: MastraMcpManagerLike | undefined,
  onDebug?: (info: Record<string, unknown>) => void,
): Promise<MastraMcpInitResult> | undefined {
  if (!mcpManager?.hasServers()) return undefined;

  onDebug?.({ event: "mastra_mcp_init_start" });
  return mcpManager
    .initInBackground()
    .then((result) => {
      onDebug?.({
        event: "mastra_mcp_init_done",
        connectedCount: result.connected.length,
        failedCount: result.failed.length,
        skippedCount: result.skipped.length,
        totalTools: result.totalTools,
      });
      return result;
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      onDebug?.({ event: "mastra_mcp_init_failed", error });
      return {
        connected: [],
        failed: mcpManager.getServerStatuses(),
        skipped: mcpManager.getSkippedServers(),
        totalTools: 0,
      };
    });
}
