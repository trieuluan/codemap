import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import type { GithubStatus } from "../lib/api-types.js";

export function registerCheckGithubConnectionTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "check_github_connection",
    {
      title: "Check GitHub Connection",
      description:
        "Checks whether the current user has connected their GitHub account to CodeMap. " +
        "Call this before any operation that requires cloning a private repository. " +
        "If the result is connected=false, call get_github_connect_url and prompt the user to authorize access.",
      inputSchema: {},
    },
    withToolError(async () => {
      const data = await client.request<GithubStatus>("/github/status", {
        authRequired: true,
      });

      const scopes = data.scope
        ? data.scope
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean)
        : [];

      if (!data.connected) {
        const summary =
          "GitHub is NOT connected.\n\n" +
          "GitHub is optional for MCP auth, but needed for workflows that import or inspect GitHub repositories. " +
          "Next action: call get_github_connect_url to open the authorization page if repository access is needed.";

        return success(summary, {
          connected: false,
          provider: "github",
          githubLogin: null,
          scope: null,
          scopes,
          connectedAt: null,
          nextAction: "optional_connect_github",
        });
      }

      const summary = [
        "GitHub is connected.",
        `Login: @${data.githubLogin}`,
        data.scope ? `Scope: ${data.scope}` : null,
        data.connectedAt
          ? `Connected at: ${new Date(data.connectedAt).toLocaleString()}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      return success(summary, {
        connected: true,
        provider: "github",
        githubLogin: data.githubLogin,
        scope: data.scope ?? null,
        scopes,
        connectedAt: data.connectedAt ?? null,
        nextAction: "ready",
      });
    }),
  );
}
