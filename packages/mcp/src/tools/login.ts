import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "@codemap/core/config.js";
import { createCodeMapClient } from "@codemap/core/lib/codemap-api.js";
import { startMcpLogin, tryOpenLoginBrowser, pollMcpAuthUntilDone } from "@codemap/core/lib/mcp-auth.js";
import { errorContent, success } from "@codemap/core/lib/tool-response.js";

const LOGIN_WAIT_TIMEOUT_MS = 45_000;

export function registerLoginTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "login",
    {
      title: "Login to CodeMap",
      description:
        "Starts the CodeMap MCP login flow and waits for authorization. Opens the browser for the user to approve, then polls until authorized, expired, or timed out. " +
        "Use only when the user explicitly asks to log in/connect CodeMap, or after check_auth_status/cloud tools show authentication is required. " +
        "Do not call during normal local coding; local index and file tools do not require cloud auth.",
      inputSchema: {},
    },
    async () => {
      try {
        // Phase 1: Start auth flow
        const startResponse = await startMcpLogin(client);
        const openedBrowser = await tryOpenLoginBrowser(startResponse.authorizeUrl);

        // Phase 2: Poll until done
        const result = await pollMcpAuthUntilDone(config, startResponse.sessionId, {
          maxWaitMs: LOGIN_WAIT_TIMEOUT_MS,
          pollIntervalMs: startResponse.pollIntervalMs,
          expiresAt: startResponse.expiresAt,
        });

        const browserMessage = openedBrowser
          ? "Browser opened for CodeMap authorization."
          : "Authorization URL was generated.";

        let statusMessage: string;
        if (result.status === "authorized") {
          statusMessage = "CodeMap MCP authentication completed successfully. GitHub setup is optional; call manage_git_connection(provider='github', action='check') if the next workflow needs repository access.";
        } else if (result.status === "pending") {
          statusMessage = `Authorization is still pending after ${Math.round(LOGIN_WAIT_TIMEOUT_MS / 1000)} seconds. Ask the user to complete browser login and approve MCP access, then call login again.`;
        } else if (result.status === "expired") {
          statusMessage = "Authorization session expired before login completed. Call login to create a new browser login link.";
        } else {
          statusMessage = "Authorization request was denied.";
        }

        const data = {
          authenticated: result.authenticated,
          status: result.status,
          apiUrl: result.apiUrl,
          user: result.user,
          sessionId: startResponse.sessionId,
          authorizeUrl: startResponse.authorizeUrl,
          openedBrowser,
          timedOut: result.timedOut ?? false,
          expiresAt: result.expiresAt,
          message: `${browserMessage} ${statusMessage}`,
        };

        return success(JSON.stringify(data, null, 2), data);
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
