import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { getMcpWhoAmI } from "../lib/mcp-auth.js";
import { success, errorContent } from "../lib/tool-response.js";
import type { GithubStatus } from "../lib/api-types.js";

type GitlabStatus =
  | { connected: false }
  | { connected: true; gitlabLogin: string; scope: string; connectedAt: string };

export function registerCheckAuthStatusTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "check_auth_status",
    {
      title: "Check Auth Status",
      description:
        "Checks whether this CodeMap MCP server is authenticated with CodeMap and which user it is currently using. " +
        "Use only when the user asks about login/auth status, a cloud/auth-required tool fails, or before starting an explicit login flow. " +
        "Do not call during normal local coding; local index and file tools do not require cloud auth. " +
        "Returns data.authenticated (boolean), data.user (object), and data.nextAction with one of: " +
        "'ready' (authenticated, proceed to get_project), " +
        "'optional_github_connect' (authenticated but GitHub not connected — GitHub is optional unless importing private GitHub repos).",
      inputSchema: {},
    },
    async () => {
      if (!config.apiToken) {
        const summary =
          `Not authenticated.\nAPI URL: ${config.apiUrl}\n` +
          "Next action: call `login` to begin browser login and wait for authorization. " +
          "For CLI usage, run `codemap-mcp login`.";

        return success(summary, {
          authenticated: false,
          apiUrl: config.apiUrl,
          user: null,
          loginRequired: true,
        });
      }

      try {
        const [response, githubResult, gitlabResult] = await Promise.allSettled([
          getMcpWhoAmI(client),
          client.request<GithubStatus>("/github/status", { authRequired: true }),
          client.request<GitlabStatus>("/gitlab/status", { authRequired: true }),
        ]);

        if (response.status === "rejected") throw response.reason;

        const whoami = response.value;
        const github = githubResult.status === "fulfilled" ? githubResult.value : null;
        const gitlab = gitlabResult.status === "fulfilled" ? gitlabResult.value : null;

        const summary = [
          "Authenticated with CodeMap.",
          `API URL: ${whoami.apiUrl}`,
          whoami.user.email ? `Email: ${whoami.user.email}` : null,
          whoami.user.name ? `Name: ${whoami.user.name}` : null,
          github?.connected ? `GitHub: connected as @${github.githubLogin}` : "GitHub: not connected",
          gitlab?.connected ? `GitLab: connected as @${gitlab.gitlabLogin}` : "GitLab: not connected",
          "Authenticated. Local tools (search_codebase, get_file, edit_file, bash) work now — call refresh_local_index if not done yet. Cloud project is optional: use link_project to connect an existing one, or create_project to create one (first time only).",
        ]
          .filter(Boolean)
          .join("\n");

        return success(summary, {
          authenticated: true,
          apiUrl: whoami.apiUrl,
          user: whoami.user,
          loginRequired: false,
          github: github ?? { connected: false },
          gitlab: gitlab ?? { connected: false },
          nextAction: "ready",
        });
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
