import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  MCP_FIRST_RULE_MARKDOWN,
  MCP_FIRST_RULE_URI,
  SKILL_ROUTING_RULE_MARKDOWN,
  SKILL_ROUTING_RULE_URI,
  TASK_LIFECYCLE_RULE_MARKDOWN,
  TASK_LIFECYCLE_RULE_URI,
  VERIFICATION_BEFORE_COMPLETION_RULE_MARKDOWN,
  VERIFICATION_BEFORE_COMPLETION_RULE_URI,
  WORKFLOW_GATES_RULE_MARKDOWN,
  WORKFLOW_GATES_RULE_URI,
  buildAgentWorkflowMarkdown,
} from "@codemap-ai/core/lib/agent-workflow.js";

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

  server.registerResource(
    "skill-routing-rule",
    SKILL_ROUTING_RULE_URI,
    {
      title: "CodeMap Skill Routing Rule",
      description:
        "Bundled rule for choosing required CodeMap Agent Pack skills by task type.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: SKILL_ROUTING_RULE_MARKDOWN,
        },
      ],
    }),
  );

  server.registerResource(
    "workflow-gates-rule",
    WORKFLOW_GATES_RULE_URI,
    {
      title: "CodeMap Workflow Gates Rule",
      description:
        "Superpowers-style gates for CodeMap work: orient, design, plan, implement, verify, finish.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: WORKFLOW_GATES_RULE_MARKDOWN,
        },
      ],
    }),
  );

  server.registerResource(
    "verification-before-completion-rule",
    VERIFICATION_BEFORE_COMPLETION_RULE_URI,
    {
      title: "CodeMap Verification Before Completion Rule",
      description:
        "Checklist agents must complete before declaring edited work done.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: VERIFICATION_BEFORE_COMPLETION_RULE_MARKDOWN,
        },
      ],
    }),
  );
}
