import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { text, withToolError } from "../lib/tool-response.js";
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

      if (!data.connected) {
        return text(
          "GitHub is NOT connected.\n\n" +
          "The user has not authorized CodeMap to access their GitHub account. " +
          "Call get_github_connect_url to get an authorization link, then ask the user to open it in their browser.",
        );
      }

      return text(
        [
          "GitHub is connected.",
          `Login: @${data.githubLogin}`,
          data.scope ? `Scope: ${data.scope}` : null,
          data.connectedAt
            ? `Connected at: ${new Date(data.connectedAt).toLocaleString()}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }),
  );
}
