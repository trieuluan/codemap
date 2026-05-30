import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "@codemap/core/config.js";
import { z } from "zod";
import { createCodeMapClient } from "@codemap/core/lib/codemap-api.js";
import { openUrlInBrowser } from "@codemap/core/lib/open-url.js";
import { errorContent, success, withToolError } from "@codemap/core/lib/tool-response.js";
import type { GithubStatus } from "@codemap/core/lib/api-types.js";

type GitlabStatus =
  | { connected: false }
  | { connected: true; gitlabLogin: string; scope: string; connectedAt: string };

const PROVIDER_CONFIG = {
  github: {
    label: "GitHub",
    connectPath: "/github/connect",
    optionalConnect: true,
  },
  gitlab: {
    label: "GitLab",
    connectPath: "/gitlab/connect",
    optionalConnect: false,
  },
} as const;

export function registerManageGitConnectionTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "manage_git_connection",
    {
      title: "Manage Git Provider Connection",
      description:
        "Check or initiate OAuth connection for GitHub or GitLab. " +
        "Use action='check' to see if a provider is connected (returns login, scope, connectedAt). " +
        "Use action='connect' to generate an OAuth URL and open it in the browser. " +
        "Prefer check_auth_status for a quick overview of both providers; " +
        "use this tool only when you need per-provider details or to initiate a connection.",
      inputSchema: {
        provider: z
          .enum(["github", "gitlab"])
          .describe("Which git provider to manage."),
        action: z
          .enum(["check", "connect"])
          .describe(
            "'check' — return connection status (login, scope, dates). " +
              "'connect' — generate OAuth URL and open it in the browser.",
          ),
      },
    },
    withToolError(async ({ provider, action }) => {
      const pc = PROVIDER_CONFIG[provider];

      if (action === "connect") {
        const data = await client.request<{ url: string }>(pc.connectPath, {
          authRequired: true,
        });

        if (!data.url) {
          return errorContent("Could not retrieve authorization URL from API.");
        }

        await openUrlInBrowser(data.url);

        const optional = pc.optionalConnect ? "optional " : "";
        const summary = [
          `${pc.label} authorization page has been opened in the browser.`,
          "",
          "If the browser did not open automatically, navigate to this URL manually:",
          "",
          data.url,
          "",
          `Once the user completes the ${optional}${pc.label} authorization, call manage_git_connection(action='check') again to confirm.`,
        ].join("\n");

        return success(summary, {
          url: data.url,
          openedBrowser: true,
          provider,
          action,
        });
      }

      // action === "check"
      if (provider === "github") {
        const data = await client.request<GithubStatus>("/github/status", {
          authRequired: true,
        });

        const scopes = data.scope
          ? data.scope
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        if (!data.connected) {
          return success(
            "GitHub is NOT connected.\n\n" +
              "GitHub is optional for MCP auth, but needed for workflows that import or inspect GitHub repositories. " +
              "Next action: call manage_git_connection(provider='github', action='connect') to authorize.",
            {
              connected: false,
              provider,
              githubLogin: null,
              scope: null,
              scopes,
              connectedAt: null,
              nextAction: "connect",
            },
          );
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
          provider,
          githubLogin: data.githubLogin,
          scope: data.scope ?? null,
          scopes,
          connectedAt: data.connectedAt ?? null,
          nextAction: "ready",
        });
      }

      // provider === "gitlab"
      const data = await client.request<GitlabStatus>("/gitlab/status", {
        authRequired: true,
      });

      const scopes =
        data.connected && data.scope
          ? data.scope.split(",").map((s) => s.trim()).filter(Boolean)
          : [];

      if (!data.connected) {
        return success(
          "GitLab is NOT connected.\n\nNeeded for workflows that import private GitLab repositories. " +
            "Next action: call manage_git_connection(provider='gitlab', action='connect') to authorize.",
          {
            connected: false,
            provider,
            gitlabLogin: null,
            scope: null,
            scopes,
            connectedAt: null,
            nextAction: "connect",
          },
        );
      }

      const summary = [
        "GitLab is connected.",
        `Login: @${data.gitlabLogin}`,
        data.scope ? `Scope: ${data.scope}` : null,
        data.connectedAt
          ? `Connected at: ${new Date(data.connectedAt).toLocaleString()}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      return success(summary, {
        connected: true,
        provider,
        gitlabLogin: data.gitlabLogin,
        scope: data.scope ?? null,
        scopes,
        connectedAt: data.connectedAt ?? null,
        nextAction: "ready",
      });
    }),
  );
}
