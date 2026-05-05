import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  MCP_FIRST_RULE_MARKDOWN,
  MCP_FIRST_RULE_URI,
  TASK_LIFECYCLE_RULE_MARKDOWN,
  TASK_LIFECYCLE_RULE_URI,
  buildAgentWorkflowMarkdown,
} from "../lib/agent-workflow.js";

export function registerAgentRuleResources(server: McpServer) {
  server.registerResource(
    "agent-workflow",
    "codemap://rules/agent-workflow",
    {
      title: "CodeMap Agent Workflow",
      description:
        "Bundled CodeMap MCP workflow. Read this at the start of a coding session to choose the right CodeMap tools.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: buildAgentWorkflowMarkdown(),
        },
      ],
    }),
  );

  server.registerResource(
    "mcp-first-rule",
    MCP_FIRST_RULE_URI,
    {
      title: "CodeMap MCP-First Rule",
      description:
        "Bundled rule for choosing CodeMap MCP tools before raw file reads or grep.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: MCP_FIRST_RULE_MARKDOWN,
        },
      ],
    }),
  );

  server.registerResource(
    "task-lifecycle-rule",
    TASK_LIFECYCLE_RULE_URI,
    {
      title: "CodeMap Task Lifecycle Rule",
      description:
        "Bundled task lifecycle for CodeMap agents: orient, read, edit, verify, diff, reimport, summarize.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: TASK_LIFECYCLE_RULE_MARKDOWN,
        },
      ],
    }),
  );
}
