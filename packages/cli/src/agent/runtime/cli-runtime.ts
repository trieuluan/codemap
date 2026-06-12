import type {
  AgentLoopResult,
  SingleAgentRuntimeInput,
} from "@codemap-ai/core/agent";
import { runWithMastraHarness } from "./harness-runtime.js";

// Re-export types so existing consumers don't need to change imports
export type {
  ChatUiMode,
  AgentPhase,
  PlanReviewAction,
  SingleAgentRuntimeInput,
} from "@codemap-ai/core/agent";

export async function runSingleAgentRuntime(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
  return runWithMastraHarness(input);
}
