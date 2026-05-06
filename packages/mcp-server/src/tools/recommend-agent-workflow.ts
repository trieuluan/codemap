import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  TASK_TYPES,
  buildWorkflowRecommendationMarkdown,
  recommendAgentWorkflow,
} from "../lib/agent-workflow.js";
import { success, withToolError } from "../lib/tool-response.js";

export function registerRecommendAgentWorkflowTool(server: McpServer) {
  server.registerTool(
    "recommend_agent_workflow",
    {
      title: "Recommend Agent Workflow",
      description:
        "Recommend the required CodeMap Agent Pack skills, hard gates, first tools, artifact templates, " +
        "and verification checklist for a task. Call this before broad implementation, debugging, review, " +
        "refactor, test, or research work.",
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
      const recommendation = recommendAgentWorkflow({ task, taskType, risk });
      return success(buildWorkflowRecommendationMarkdown(recommendation), recommendation);
    }),
  );
}
