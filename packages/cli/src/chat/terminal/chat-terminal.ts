/**
 * Facade — re-exports from the refactored chat-terminal/ modules.
 *
 * All implementations live under ./chat-terminal/.
 * This file exists for backward-compatibility with existing imports.
 */
export {
  ChatTerminal,
  extractCloudCommitFromGetProject,
} from "./index.js";

export {
  buildCodeMapAgentInstructions,
  buildCurrentTaskContent,
} from "./config/agent-instructions.js";

export type { Message as ChatEntry } from "../state/store.js";
