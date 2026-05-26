import type { AgentLoopResult } from "../agent/agent-loop.js";
import { runWithMastraHarness, runMultiPhaseWithMastra } from "./mastra-harness-runtime.js";
import type { SingleAgentRuntimeInput, MultiPhaseLoopInput } from "./runtime-types.js";

// Re-export types so existing consumers don't need to change imports
export type {
  ChatUiMode,
  AgentPhase,
  PlanReviewAction,
  SingleAgentRuntimeInput,
  MultiPhaseLoopInput,
} from "./runtime-types.js";

export async function runSingleAgentRuntime(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
  return runWithMastraHarness(input);
}

export async function runMultiPhaseAgentRuntime(
  input: MultiPhaseLoopInput,
): Promise<AgentLoopResult> {
  return runMultiPhaseWithMastra(input);
}
