// @codemap-ai/core — shared internal library
// Consumers can import from subpaths: @codemap-ai/core/lib/foo or from this barrel

export * from "./config.ts";
export * from "./lib/api-types.ts";
export * from "./lib/agent-pack.ts";
export * from "./lib/agent-pack-doctor.ts";
export * from "./lib/agent-pack-installer.ts";
export * from "./lib/agent-workflow.ts";
export * from "./lib/auto-inject.ts";
export * from "./lib/bundled-runtime.ts";
export * from "./lib/codemap-api.ts";
export * from "./lib/import-health.ts";
export * from "./lib/local-index.ts";
export * from "./lib/markdown-fence.ts";
export * from "./lib/mcp-auth.ts";
export * from "./lib/onboarding.ts";
export * from "./lib/open-url.ts";
export * from "./lib/regex-utils.ts";
export * from "./lib/server-instructions.ts";
export * from "./lib/session-context.ts";
export * from "./lib/session-tracker.ts";
export * from "./lib/sqlite-index-store.ts";
export * from "./lib/state-store.ts";
export * from "./lib/deep-merge.ts";
export * from "./lib/tool-response.ts";
export * from "./lib/uuid-schema.ts";
export * from "./lib/workspace-git.ts";
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
} from "./lib/workspace-project.ts";
export * from "./lib/workspace-resolver.ts";
export * from "./lib/workspace-zip.ts";
