import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";

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
      if (!config.apiUrl) {
        return {
          content: [
            {
              type: "text",
              text: "Error: API_URL is not configured. Set the API_URL environment variable to the CodeMap API base URL.",
            },
          ],
          isError: true,
        };
      }

      if (!config.apiToken) {
        return {
          content: [
            {
              type: "text",
              text: "Error: API_TOKEN is not configured. Set the API_TOKEN environment variable to your CodeMap API key.",
            },
          ],
          isError: true,
        };
      }

      const url = new URL("/github/connect", config.apiUrl);

      let response: Response;

      try {
        response = await fetch(url.toString(), {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiToken,
            Authorization: `Bearer ${config.apiToken}`,
          },
        });
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Failed to reach CodeMap API at ${config.apiUrl}. ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          content: [
            {
              type: "text",
              text: `Error: CodeMap API returned ${response.status} ${response.statusText}. ${body}`,
            },
          ],
          isError: true,
        };
      }

      const json = (await response.json()) as {
        data?: { url: string };
      };

      const connectUrl = json?.data?.url;

      if (!connectUrl) {
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
              connectUrl,
              "",
              "After they complete the authorization, call check_github_connection to verify the connection was successful.",
            ].join("\n"),
          },
        ],
      };
    },
  );
}
