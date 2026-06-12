import type {
  AgentLoopResult,
} from "@codemap-ai/core/agent";
import {
  runWithMastraHarness,
  type SingleAgentRuntimeInput,
} from "@codemap-ai/runtime-node";

// Re-export types so existing consumers don't need to change imports
export type {
  ChatUiMode,
  AgentPhase,
  PlanReviewAction,
  SingleAgentRuntimeInput,
} from "@codemap-ai/runtime-node";

export async function runSingleAgentRuntime(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
  return runWithMastraHarness(input);
}
