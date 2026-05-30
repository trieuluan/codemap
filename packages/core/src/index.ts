// @codemap/core — shared internal library
// Consumers can import from subpaths: @codemap/core/lib/foo or from this barrel

export * from "./config.js";
export * from "./lib/api-types.js";
export * from "./lib/agent-pack.js";
export * from "./lib/agent-pack-doctor.js";
export * from "./lib/agent-pack-installer.js";
export * from "./lib/agent-workflow.js";
export * from "./lib/auto-inject.js";
export * from "./lib/bundled-runtime.js";
export * from "./lib/codemap-api.js";
export * from "./lib/import-health.js";
export * from "./lib/local-index.js";
export * from "./lib/markdown-fence.js";
export * from "./lib/mcp-auth.js";
export * from "./lib/onboarding.js";
export * from "./lib/open-url.js";
export * from "./lib/regex-utils.js";
export * from "./lib/server-instructions.js";
export * from "./lib/session-context.js";
export * from "./lib/session-tracker.js";
export * from "./lib/sqlite-index-store.js";
export * from "./lib/tool-response.js";
export * from "./lib/uuid-schema.js";
export * from "./lib/workspace-git.js";
export {
  type WorkspaceProjectConfig,
  readWorkspaceProjectConfig,
  readPriorityResources,
  readMcpServerConfigs,
  readWorkspaceProjectId,
  readWorkspacePath,
  saveWorkspaceProjectId,
  saveMcpServerEntry,
  removeMcpServerEntry,
} from "./lib/workspace-project.js";
export * from "./lib/workspace-resolver.js";
export * from "./lib/workspace-zip.js";
