import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { pollMcpAuthUntilDone } from "../lib/mcp-auth.js";
import { errorContent, success } from "../lib/tool-response.js";

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
            ? "CodeMap MCP authentication completed successfully. GitHub setup is optional; call check_github_connection if the next workflow needs repository access."
            : result.status === "pending"
              ? `Authorization is still pending after ${Math.round(LOCAL_WAIT_TIMEOUT_MS / 1000)} seconds. Ask the user to complete browser login and approve MCP access, then call wait_for_auth again.`
              : result.status === "expired"
                ? "Authorization session expired before login completed. Call start_auth_flow to create a new browser login link."
                : "Authorization request was denied.";
        const data = {
          authenticated: result.authenticated,
          status: result.status,
          apiUrl: result.apiUrl,
          user: result.user,
          expiresAt: result.expiresAt,
          timedOut: result.timedOut ?? false,
          sessionId,
          message,
        };

        return success(JSON.stringify(data, null, 2), data);
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
