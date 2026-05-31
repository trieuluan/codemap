/**
 * Facade — re-exports from the refactored chat-terminal/ modules.
 *
 * All implementations live under ./chat-terminal/.
 * This file exists for backward-compatibility with existing imports.
 */
export {
  ChatTerminal,
  extractCloudCommitFromGetProject,
} from "./chat-terminal/index.js";

export {
  buildCodeMapAgentInstructions,
  buildCurrentTaskContent,
} from "./chat-terminal/agent-instructions.js";

export type { Message as ChatEntry } from "./store.js";
