import type { AgentLoopResult } from "../loop/agent-loop.js";
import { runWithMastraHarness } from "./harness-runtime.js";
import type { SingleAgentRuntimeInput } from "./types.js";

// Re-export types so existing consumers don't need to change imports
export type {
  ChatUiMode,
  AgentPhase,
  PlanReviewAction,
  SingleAgentRuntimeInput,
} from "./types.js";

export async function runSingleAgentRuntime(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
  return runWithMastraHarness(input);
}
