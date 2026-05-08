import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AGENT_PACK_DOCTOR_TARGETS,
  buildAgentPackDoctorMarkdown,
  doctorAgentPack,
} from "../lib/agent-pack-doctor.js";
import { success, withToolError } from "../lib/tool-response.js";

export function registerDoctorAgentPackTool(server: McpServer) {
  server.registerTool(
    "doctor_agent_pack",
    {
      title: "Doctor Agent Pack",
      description:
        "Verifies that CodeMap Agent Pack rules and skills are installed for this workspace. " +
        "Use this after init-agent-pack, or when an agent is unsure whether get_agent_workflow, " +
        "recommend_agent_workflow, required skills, and verification gates are visible to the host.",
      inputSchema: {
        root: z
          .string()
          .optional()
          .describe("Workspace root to check. Defaults to the MCP server current working directory."),
        target: z
          .enum(AGENT_PACK_DOCTOR_TARGETS)
          .optional()
          .describe("Agent harness to check. Defaults to auto-detecting installed harnesses."),
      },
    },
    withToolError(async ({ root, target }) => {
      const result = await doctorAgentPack({ root, target });
      return success(buildAgentPackDoctorMarkdown(result), result);
    }),
  );
}
