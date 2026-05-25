import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AGENT_PACK_INDEX_URI,
  AGENT_PACK_INSTALL_URI,
  AGENT_PACK_SKILLS,
  skillResourceUri,
} from "../lib/agent-pack.js";
import {
  AGENT_WORKFLOW_SEQUENCE,
  AGENT_WORKFLOW_SUMMARY,
  ARTIFACT_TEMPLATES,
  MCP_FIRST_RULE_URI,
  SKILL_ROUTING_RULE_URI,
  TASK_LIFECYCLE_RULE_URI,
  VERIFICATION_BEFORE_COMPLETION_RULE_URI,
  WORKFLOW_GATES_RULE_URI,
  WORKFLOW_ROUTES,
  buildAgentWorkflowMarkdown,
} from "../lib/agent-workflow.js";
import { success, withToolError } from "../lib/tool-response.js";
import { sessionTracker } from "../lib/session-tracker.js";

export function registerGetAgentWorkflowTool(server: McpServer) {
  server.registerTool(
    "get_agent_workflow",
    {
      title: "Get Agent Workflow",
      description:
        "Meta/workflow tool. Use only when CodeMap workflow context is missing, the host has not injected CodeMap agent instructions, " +
        "or the user explicitly asks for the agent workflow/rules. Do not call during ordinary chat, simple questions, or after workflow context is already known. " +
        "Returns MCP-first workflow rules, exact tool routing guide, skill URIs, hard gates, and artifact templates. " +
        "Call at most once per fresh coding session unless context was reset.",
      inputSchema: {},
    },
    withToolError(async () => {
      sessionTracker.markCalled("get_agent_workflow");
      return success(buildAgentWorkflowMarkdown(), {
        summary: AGENT_WORKFLOW_SUMMARY,
        recommendedSequence: AGENT_WORKFLOW_SEQUENCE,
        workflowRoutes: WORKFLOW_ROUTES,
        artifactTemplates: ARTIFACT_TEMPLATES,
        resources: [
          MCP_FIRST_RULE_URI,
          TASK_LIFECYCLE_RULE_URI,
          SKILL_ROUTING_RULE_URI,
          WORKFLOW_GATES_RULE_URI,
          VERIFICATION_BEFORE_COMPLETION_RULE_URI,
          AGENT_PACK_INDEX_URI,
          AGENT_PACK_INSTALL_URI,
          ...AGENT_PACK_SKILLS.map((skill) => skillResourceUri(skill)),
        ],
      });
    }),
  );
}
