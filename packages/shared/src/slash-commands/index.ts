/**
 * Slash Commands Module
 *
 * Universal slash commands shared between CLI and Desktop
 */

// Types
export type {
  Appender,
  UniversalCommandContext,
  UniversalCommand,
} from "./types/index.js";

// Helpers
export * as helpers from "./helpers.js";

// Individual Commands
export { helpCommand } from "./universal/help.js";
export { statusCommand } from "./universal/status.js";
export { toolsCommand } from "./universal/tools.js";
export { modelsCommand } from "./universal/models.js";
export { mcpCommand } from "./universal/mcp.js";

// Re-export all as an array for consumers
import { helpCommand } from "./universal/help.js";
import { statusCommand } from "./universal/status.js";
import { toolsCommand } from "./universal/tools.js";
import { modelsCommand } from "./universal/models.js";
import { mcpCommand } from "./universal/mcp.js";
import type { UniversalCommand } from "./types/index.js";

export const universalCommands: readonly UniversalCommand[] = [
  helpCommand,
  statusCommand,
  toolsCommand,
  modelsCommand,
  mcpCommand,
];
