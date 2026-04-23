import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";

export function registerCheckGithubConnectionTool(
  server: McpServer,
  config: McpServerConfig,
) {
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

      const url = new URL("/github/status", config.apiUrl);

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
        data?: {
          connected: boolean;
          githubLogin: string | null;
          scope?: string;
          connectedAt?: string;
        };
      };

      const data = json?.data;

      if (!data) {
        return {
          content: [{ type: "text", text: "Error: Unexpected response from API." }],
          isError: true,
        };
      }

      if (!data.connected) {
        return {
          content: [
            {
              type: "text",
              text: "GitHub is NOT connected.\n\nThe user has not authorized CodeMap to access their GitHub account. Call get_github_connect_url to get an authorization link, then ask the user to open it in their browser.",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: [
              "GitHub is connected.",
              `Login: @${data.githubLogin}`,
              data.scope ? `Scope: ${data.scope}` : null,
              data.connectedAt
                ? `Connected at: ${new Date(data.connectedAt).toLocaleString()}`
                : null,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    },
  );
}
