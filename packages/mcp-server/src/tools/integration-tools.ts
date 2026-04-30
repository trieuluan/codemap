import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { openUrlInBrowser } from "../lib/open-url.js";
import { errorContent, success, withToolError } from "../lib/tool-response.js";

type IntegrationProvider = {
  id: "github" | "gitlab";
  label: "GitHub" | "GitLab";
  connectToolName: string;
  checkToolName: string;
  disconnectToolName: string;
  connectPath: string;
  disconnectPath: string;
  privateRepoLabel: string;
  optionalConnect?: boolean;
};

export function registerIntegrationConnectUrlTool(
  server: McpServer,
  config: McpServerConfig,
  provider: IntegrationProvider,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    provider.connectToolName,
    {
      title: `Get ${provider.label} Connect URL`,
      description:
        `Generates a ${provider.label} OAuth authorization URL and automatically opens it in the user's default browser. ` +
        `Use this when ${provider.checkToolName} returns connected=false. ` +
        "The browser will be opened automatically — the user just needs to complete the authorization flow. " +
        `Once they finish, call ${provider.checkToolName} again to confirm the connection.`,
      inputSchema: {},
    },
    withToolError(async () => {
      const data = await client.request<{ url: string }>(provider.connectPath, {
        authRequired: true,
      });

      if (!data.url) {
        return errorContent("Could not retrieve authorization URL from API.");
      }

      await openUrlInBrowser(data.url);

      const optional = provider.optionalConnect ? "optional " : "";
      const summary = [
        `${provider.label} authorization page has been opened in the browser.`,
        "",
        "If the browser did not open automatically, the user can navigate to this URL manually:",
        "",
        data.url,
        "",
        `Once the user completes the ${optional}${provider.label} authorization, call ${provider.checkToolName} again to confirm the connection.`,
      ].join("\n");

      return success(summary, {
        url: data.url,
        openedBrowser: true,
        provider: provider.id,
        nextAction: provider.checkToolName,
      });
    }),
  );
}

export function registerIntegrationDisconnectTool(
  server: McpServer,
  config: McpServerConfig,
  provider: IntegrationProvider,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    provider.disconnectToolName,
    {
      title: `Disconnect ${provider.label}`,
      description:
        `Removes the user's connected ${provider.label} account from CodeMap. ` +
        `After disconnecting, CodeMap will no longer be able to clone ${provider.privateRepoLabel}. ` +
        `Only call this when the user explicitly asks to disconnect or revoke ${provider.label} access.`,
      inputSchema: {},
    },
    withToolError(async () => {
      await client.request<{ disconnected: true }>(provider.disconnectPath, {
        method: "DELETE",
        authRequired: true,
      });

      return success(
        `${provider.label} account disconnected successfully. CodeMap no longer has access to the user's ${provider.label} repositories.`,
        {
          disconnected: true,
          provider: provider.id,
        },
      );
    }),
  );
}

export const githubIntegrationProvider: IntegrationProvider = {
  id: "github",
  label: "GitHub",
  connectToolName: "get_github_connect_url",
  checkToolName: "check_github_connection",
  disconnectToolName: "disconnect_github",
  connectPath: "/github/connect",
  disconnectPath: "/github/disconnect",
  privateRepoLabel: "private repositories",
  optionalConnect: true,
};

export const gitlabIntegrationProvider: IntegrationProvider = {
  id: "gitlab",
  label: "GitLab",
  connectToolName: "get_gitlab_connect_url",
  checkToolName: "check_gitlab_connection",
  disconnectToolName: "disconnect_gitlab",
  connectPath: "/gitlab/connect",
  disconnectPath: "/gitlab/disconnect",
  privateRepoLabel: "private GitLab repositories",
};
