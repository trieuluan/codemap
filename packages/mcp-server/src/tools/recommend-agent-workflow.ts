import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  TASK_TYPES,
  buildWorkflowRecommendationMarkdown,
  recommendAgentWorkflow,
} from "../lib/agent-workflow.js";
import { success, withToolError } from "../lib/tool-response.js";
import { sessionTracker } from "../lib/session-tracker.js";

export function registerRecommendAgentWorkflowTool(server: McpServer) {
  server.registerTool(
    "recommend_agent_workflow",
    {
      title: "Recommend Agent Workflow",
      description:
        "Meta/task-planning tool. Use only for broad implementation, debugging, review, refactor, test, or research tasks where the correct workflow is unclear. " +
        "Do not call for normal chat, identity questions, small direct lookups, or when the next concrete tool is already obvious. " +
        "Returns the required skill sequence, hard gates, first tool to call, artifact templates, " +
        "and verification checklist tailored to the specific task type. " +
        "Use explore_task/search_codebase for repository lookup; use this only for task-level workflow planning.",
      inputSchema: {
        task: z
          .string()
          .min(1)
          .describe("Natural-language task or user request to classify."),
        taskType: z
          .enum(TASK_TYPES)
          .optional()
          .describe(
            "Optional explicit task category. If omitted, CodeMap infers one from the task text.",
          ),
        risk: z
          .enum(["low", "medium", "high"])
          .optional()
          .describe("Optional risk level. High risk adds an explicit approval gate."),
      },
    },
    withToolError(async ({ task, taskType, risk }) => {
      sessionTracker.markCalled("recommend_agent_workflow");
      sessionTracker.incrementTask();
      const recommendation = recommendAgentWorkflow({ task, taskType, risk });
      return success(buildWorkflowRecommendationMarkdown(recommendation), recommendation);
    }),
  );
}
