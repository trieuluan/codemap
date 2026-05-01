import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";

type GitlabStatus =
  | { connected: false }
  | { connected: true; gitlabLogin: string; scope: string; connectedAt: string };

export function registerCheckGitlabConnectionTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "check_gitlab_connection",
    {
      title: "Check GitLab Connection",
      description:
        "Checks whether the current user has connected their GitLab account to CodeMap. " +
        "Prefer check_auth_status which checks GitHub and GitLab in a single call. " +
        "Use this only when you need detailed GitLab scope/token info. " +
        "If connected=false, call get_gitlab_connect_url and prompt the user to authorize.",
      inputSchema: {},
    },
    withToolError(async () => {
      const data = await client.request<GitlabStatus>("/gitlab/status", {
        authRequired: true,
      });

      const scopes =
        data.connected && data.scope
          ? data.scope.split(",").map((s) => s.trim()).filter(Boolean)
          : [];

      if (!data.connected) {
        return success(
          "GitLab is NOT connected.\n\nNeeded for workflows that import private GitLab repositories. " +
            "Next action: call get_gitlab_connect_url to open the authorization page.",
          {
            connected: false,
            provider: "gitlab",
            gitlabLogin: null,
            scope: null,
            scopes,
            connectedAt: null,
            nextAction: "optional_connect_gitlab",
          },
        );
      }

      const summary = [
        "GitLab is connected.",
        `Login: @${data.gitlabLogin}`,
        data.scope ? `Scope: ${data.scope}` : null,
        data.connectedAt ? `Connected at: ${new Date(data.connectedAt).toLocaleString()}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      return success(summary, {
        connected: true,
        provider: "gitlab",
        gitlabLogin: data.gitlabLogin,
        scope: data.scope ?? null,
        scopes,
        connectedAt: data.connectedAt ?? null,
        nextAction: "ready",
      });
    }),
  );
}
