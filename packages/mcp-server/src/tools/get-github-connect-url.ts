import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { errorContent, success, withToolError } from "../lib/tool-response.js";
import { openUrlInBrowser } from "../lib/open-url.js";

export function registerGetGithubConnectUrlTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "get_github_connect_url",
    {
      title: "Get GitHub Connect URL",
      description:
        "Generates a GitHub OAuth authorization URL and automatically opens it in the user's default browser. " +
        "Use this when check_github_connection returns connected=false. " +
        "The browser will be opened automatically — the user just needs to complete the authorization flow. " +
        "Once they finish, call check_github_connection again to confirm the connection.",
      inputSchema: {},
    },
    withToolError(async () => {
      const data = await client.request<{ url: string }>("/github/connect", {
        authRequired: true,
      });

      if (!data.url) {
        return errorContent("Could not retrieve authorization URL from API.");
      }

      await openUrlInBrowser(data.url);

      const summary = [
        "GitHub authorization page has been opened in the browser.",
        "",
        "If the browser did not open automatically, the user can navigate to this URL manually:",
        "",
        data.url,
        "",
        "Once the user completes the authorization, call check_github_connection again to confirm the connection was successful.",
      ].join("\n");

      return success(summary, {
        url: data.url,
        openedBrowser: true,
        provider: "github",
      });
    }),
  );
}
