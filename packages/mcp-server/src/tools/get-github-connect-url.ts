import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { requestCodeMapApi, toToolErrorContent } from "../lib/codemap-api.js";

interface GithubConnectUrlResponse {
  url: string;
}

export function registerGetGithubConnectUrlTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "get_github_connect_url",
    {
      title: "Get GitHub Connect URL",
      description:
        "Returns a GitHub OAuth authorization URL that the user must open in their browser to grant CodeMap access to their repositories. " +
        "Use this when check_github_connection returns connected=false. " +
        "After getting the URL, present it to the user and ask them to open it. " +
        "Once they complete authorization, call check_github_connection again to confirm the connection.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await requestCodeMapApi<GithubConnectUrlResponse>(
          config,
          "/github/connect",
          {
            authRequired: true,
          },
        );

        if (!data.url) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Could not retrieve authorization URL from API.",
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: [
                "GitHub authorization URL generated successfully.",
                "",
                "Ask the user to open the following URL in their browser to grant CodeMap access to their GitHub repositories:",
                "",
                data.url,
                "",
                "After they complete the authorization, call check_github_connection again to confirm the connection was successful.",
              ].join("\n"),
            },
          ],
        };
      } catch (error) {
        return toToolErrorContent(error);
      }
    },
  );
}
