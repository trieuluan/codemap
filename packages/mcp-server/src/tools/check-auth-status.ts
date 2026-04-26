import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { getMcpWhoAmI } from "../lib/mcp-auth.js";
import { success, errorContent } from "../lib/tool-response.js";
import type { GithubStatus } from "../lib/api-types.js";

export function registerCheckAuthStatusTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "check_auth_status",
    {
      title: "Check Auth Status",
      description:
        "Checks whether this CodeMap MCP server is authenticated with CodeMap and which user it is currently using.",
      inputSchema: {},
    },
    async () => {
      if (!config.apiToken) {
        const summary =
          `Not authenticated.\nAPI URL: ${config.apiUrl}\n` +
          "Next action: call `start_auth_flow` to begin browser login, then `wait_for_auth` after the user completes authorization. " +
          "For CLI usage, run `codemap-mcp login`.";

        return success(summary, {
          authenticated: false,
          apiUrl: config.apiUrl,
          user: null,
          loginRequired: true,
        });
      }

      try {
        const response = await getMcpWhoAmI(client);
        let github: GithubStatus | null = null;
        let githubCheckError: string | null = null;

        try {
          github = await client.request<GithubStatus>("/github/status", {
            authRequired: true,
          });
        } catch (error) {
          githubCheckError =
            error instanceof Error ? error.message : "Unable to check GitHub";
        }

        const summary = [
          "Authenticated with CodeMap.",
          `API URL: ${response.apiUrl}`,
          response.user.email ? `Email: ${response.user.email}` : null,
          response.user.name ? `Name: ${response.user.name}` : null,
          response.user.id ? `User ID: ${response.user.id}` : null,
          github?.connected
            ? `GitHub: connected as @${github.githubLogin}`
            : "GitHub: not connected",
          github?.connected
            ? "Next action: call get_project to check project/index health, or create_project if this workspace is not linked yet."
            : "Next action: GitHub is optional; call `get_github_connect_url` if repository import needs GitHub access.",
          githubCheckError ? `GitHub status check: ${githubCheckError}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        return success(summary, {
          authenticated: true,
          apiUrl: response.apiUrl,
          user: response.user,
          loginRequired: false,
          github: github ?? {
            connected: false,
            githubLogin: null,
            checkError: githubCheckError,
          },
          nextAction: github?.connected
            ? "ready"
            : "optional_github_connect",
        });
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
