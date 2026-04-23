import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { pollMcpAuthUntilDone } from "../lib/mcp-auth.js";

const LOCAL_WAIT_TIMEOUT_MS = 45_000;

export function registerWaitForAuthTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "wait_for_auth",
    {
      title: "Wait For Auth",
      description:
        "Polls CodeMap MCP login status for a previously started auth session. Saves the issued API key into the global MCP config when authorization succeeds.",
      inputSchema: {
        sessionId: z.string().uuid(),
      },
    },
    async ({ sessionId }) => {
      try {
        const result = await pollMcpAuthUntilDone(config, sessionId, {
          maxWaitMs: LOCAL_WAIT_TIMEOUT_MS,
        });

        const message =
          result.status === "authorized"
            ? "CodeMap MCP authentication completed successfully."
            : result.status === "pending"
              ? `Authorization is still pending after ${Math.round(LOCAL_WAIT_TIMEOUT_MS / 1000)} seconds. Ask the user to complete browser login, then call wait_for_auth again.`
              : result.status === "expired"
                ? "Authorization session expired before login completed."
                : "Authorization request was denied.";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  authenticated: result.authenticated,
                  status: result.status,
                  apiUrl: result.apiUrl,
                  user: result.user,
                  expiresAt: result.expiresAt,
                  timedOut: result.timedOut ?? false,
                  sessionId,
                  message,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
