import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AGENT_WORKFLOW_SEQUENCE,
  AGENT_WORKFLOW_SUMMARY,
  MCP_FIRST_RULE_URI,
  TASK_LIFECYCLE_RULE_URI,
  buildAgentWorkflowMarkdown,
} from "../lib/agent-workflow.js";
import { success, withToolError } from "../lib/tool-response.js";

export function registerGetAgentWorkflowTool(server: McpServer) {
  server.registerTool(
    "get_agent_workflow",
    {
      title: "Get Agent Workflow",
      description:
        "Call this first when using CodeMap MCP tools in a new coding session. " +
        "Returns the recommended MCP-first workflow, exact tool sequence, and bundled rule resource URIs. " +
        "Use this before explore_task/search_codebase if you are unsure which CodeMap tool to call.",
      inputSchema: {},
    },
    withToolError(async () => {
      return success(buildAgentWorkflowMarkdown(), {
        summary: AGENT_WORKFLOW_SUMMARY,
        recommendedSequence: AGENT_WORKFLOW_SEQUENCE,
        resources: [MCP_FIRST_RULE_URI, TASK_LIFECYCLE_RULE_URI],
      });
    }),
  );
}
