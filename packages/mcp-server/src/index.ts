#!/usr/bin/env node

import path from "node:path";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require("../package.json") as { version: string };
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { clearGlobalAuthConfig, loadConfig } from "./config.js";
import { createCodeMapClient } from "./lib/codemap-api.js";
import {
  getMcpWhoAmI,
  startMcpLogin,
  tryOpenLoginBrowser,
  waitForLoginAuthorization,
} from "./lib/mcp-auth.js";
import { registerManageGitConnectionTool } from "./tools/manage-git-connection.js";
import { registerGetCurrentWorkspaceInfoTool } from "./tools/get-current-workspace-info.js";
import {
  registerListGithubRepositoriesTool,
  registerSearchGithubRepositoriesTool,
} from "./tools/list-github-repositories.js";
import { registerCreateProjectTool } from "./tools/create-project.js";
import { registerCreateProjectFromGithubTool } from "./tools/create-project-from-github.js";
import { registerCreateProjectFromGitlabTool } from "./tools/create-project-from-gitlab.js";
import { registerLinkProjectTool } from "./tools/link-project.js";
import { registerReimportTool } from "./tools/reimport.js";
import { registerGetProjectTool } from "./tools/get-project.js";
import { registerSearchCodebaseTool } from "./tools/search-codebase.js";
import { registerSymbolTool } from "./tools/symbol.js";
import { registerSummarizeFeatureAreaTool } from "./tools/summarize-feature-area.js";


import { registerWebFetchTool } from "./tools/web-fetch.js";
import { registerFindRelatedFilesTool } from "./tools/find-related-files.js";
import { registerFindCyclesTool } from "./tools/find-cycles.js";
import { registerRefreshLocalIndexTool } from "./tools/refresh-local-index.js";
import { registerCodeReviewTool } from "./tools/code-review.js";
import { registerGetFileTool } from "./tools/get-file.js";
import { registerMoveSymbolsTool } from "./tools/move-symbols.js";
import { registerRenameSymbolTool } from "./tools/rename-symbol.js";
import { registerDiffTool } from "./tools/diff.js";
import { registerGetProjectMapTool } from "./tools/get-project-map.js";
import { registerListProjectsTool } from "./tools/list-projects.js";
import { registerGetProjectInsightsTool } from "./tools/get-project-insights.js";
import { registerProjectContextResource } from "./resources/project-context.js";
import { registerAgentRuleResources } from "./resources/agent-rules.js";
import { registerAgentPackResources } from "./resources/agent-pack.js";
import { registerCheckAuthStatusTool } from "./tools/check-auth-status.js";
import { registerLoginTool } from "./tools/login.js";
import { registerLogoutTool } from "./tools/logout.js";
import { registerWebSearchTool } from "./tools/web-search.js";
import { registerExploreTaskTool } from "./tools/explore-task.js";
import {
  installAgentPack,
  parseAgentPackInstallArgs,
} from "./lib/agent-pack-installer.js";
import { getPluginRoot } from "./lib/agent-pack.js";
import {
  buildAgentPackDoctorMarkdown,
  doctorAgentPack,
  parseAgentPackDoctorArgs,
} from "./lib/agent-pack-doctor.js";
import {
  buildLocalIndex,
  ensureLocalIndex,
  readLocalIndex,
} from "./lib/local-index.js";
import { tryGetCurrentWorkspaceInfo } from "./lib/workspace-git.js";
import { readWorkspaceProjectConfig } from "./lib/workspace-project.js";
import { getProjectImportHealth } from "./lib/import-health.js";
import type { ProjectDetail } from "./lib/api-types.js";
import { buildOnboardingGuide, isOnboardingTarget } from "./lib/onboarding.js";
import { buildServerInstructions } from "./lib/server-instructions.js";
import { buildSessionContext } from "./lib/session-context.js";
import { autoInjectRules } from "./lib/auto-inject.js";

async function runMcpServer() {
  const config = await loadConfig();
  const server = new McpServer(
    { name: "codemap-mcp-server", version: SERVER_VERSION },
    { instructions: buildServerInstructions() },
  );

  const { toolMode } = config;

  // ── Lite tier: core exploration + auth (always registered) ──────────────
  registerCheckAuthStatusTool(server, config);
  registerLoginTool(server, config);
  registerLogoutTool(server, config);
  registerGetProjectTool(server, config);
  registerLinkProjectTool(server, config);
  registerExploreTaskTool(server, config);
  registerSearchCodebaseTool(server, config);
  registerSymbolTool(server, config);
  registerGetFileTool(server, config);

  registerGetProjectMapTool(server, config);
  registerDiffTool(server, config);
  registerRefreshLocalIndexTool(server);
  registerWebSearchTool(server);
  registerReimportTool(server, config);

  // ── Standard tier: deeper analysis + project management ─────────────────
  if (toolMode === "standard" || toolMode === "full") {
    registerGetProjectInsightsTool(server, config);
    registerWebFetchTool(server, config);
    registerFindRelatedFilesTool(server, config);
    registerSummarizeFeatureAreaTool(server, config);
    registerCreateProjectTool(server, config);
    registerCreateProjectFromGithubTool(server, config);
    registerCreateProjectFromGitlabTool(server, config);
    registerListProjectsTool(server, config);
  }

  // ── Full tier: refactoring, CI/CD, integrations ──────────────────────────
  if (toolMode === "full") {
    registerMoveSymbolsTool(server, config);
    registerRenameSymbolTool(server, config);
    registerFindCyclesTool(server, config);
    registerCodeReviewTool(server, config);
    registerManageGitConnectionTool(server, config);
    registerGetCurrentWorkspaceInfoTool(server);
    registerListGithubRepositoriesTool(server, config);
    registerSearchGithubRepositoriesTool(server, config);
  }

  // Resources — automatically surfaced to Claude as session context
  registerProjectContextResource(server, config);
  registerAgentRuleResources(server);
  registerAgentPackResources(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Auto-inject after connect — clientInfo is available now from MCP initialize handshake
  await autoInjectRules(server, process.cwd());

  // Push session context to stderr — Claude Code hooks and other agents read this
  const sessionCtx = await buildSessionContext(process.cwd()).catch(() => null);
  if (sessionCtx) process.stderr.write(sessionCtx + "\n");
}

async function runInitAgentPackCommand(args: string[]) {
  const options = parseAgentPackInstallArgs(args);
  const result = await installAgentPack(options);

  console.log(
    `${result.dryRun ? "Previewed" : "Installed"} CodeMap Agent Pack for target: ${result.target}`,
  );
  console.log(`Root: ${result.root}`);
  console.log(`Pack: ${result.packRoot}`);
  console.log(`Plugin root: ${result.pluginRoot}`);
  for (const item of result.installed) {
    console.log(`- ${item.action}: ${item.path}`);
  }
  console.log("");
  const doctorTarget = result.target === "marketplace" ? "auto" : result.target;
  console.log(`Verify with: codemap-mcp doctor-agent-pack --target ${doctorTarget} --root ${result.root}`);

  if (!result.dryRun) {
    const target = result.target;
    if (isOnboardingTarget(target) || target === "all") {
      console.log("");
      console.log(buildOnboardingGuide(target));
    }
  }
}

async function runDoctorAgentPackCommand(args: string[]) {
  const options = parseAgentPackDoctorArgs(args);
  const result = await doctorAgentPack({
    root: options.cwd,
    target: options.target,
  });
  console.log(buildAgentPackDoctorMarkdown(result));
  if (result.status === "fail") {
    process.exitCode = 1;
  }
}

function parseOnboardingArgs(args: string[]) {
  let target = "all";
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--target" || args[i] === "-t") && args[i + 1]) {
      target = args[i + 1] ?? "all";
      break;
    }
    if (args[i]?.startsWith("--target=")) {
      target = args[i]!.slice("--target=".length);
      break;
    }
  }
  return { target };
}

function runOnboardingCommand(args: string[]) {
  const { target } = parseOnboardingArgs(args);
  if (!isOnboardingTarget(target) && target !== "all") {
    console.error(`Unknown target: ${target}`);
    console.error("Valid targets: claude, cursor, codex, gemini, opencode, copilot, all");
    process.exitCode = 1;
    return;
  }
  console.log(buildOnboardingGuide(target));
}

function runAgentPackPathCommand() {
  console.log(getPluginRoot());
}

function parseLocalIndexArgs(args: string[]) {
  return {
    force: args.includes("--force"),
    status: args.includes("--status"),
  };
}

async function runLocalIndexCommand(args: string[]) {
  const options = parseLocalIndexArgs(args);
  const store = options.status
    ? (await readLocalIndex()) ?? (await buildLocalIndex())
    : await ensureLocalIndex({ force: options.force });
  const summary = store.getSummary();

  console.log(options.status ? "CodeMap local index status" : "CodeMap local index ready");
  console.log(`Workspace: ${summary.workspaceRootPath}`);
  console.log(`Cache: ${summary.cachePath}`);
  console.log(`Indexed at: ${summary.indexedAt ?? "never"}`);
  console.log(`Files: ${summary.fileCount}`);
  console.log(`Symbols: ${summary.symbolCount}`);
}

async function runLoginCommand() {
  const config = await loadConfig();
  const client = createCodeMapClient(config);
  const startResponse = await startMcpLogin(client);
  const openedBrowser = await tryOpenLoginBrowser(startResponse.authorizeUrl);

  if (openedBrowser) {
    console.log("Opened browser for CodeMap MCP login.");
  } else {
    console.log("Open this URL to continue CodeMap MCP login:");
    console.log(startResponse.authorizeUrl);
  }

  console.log("Waiting for authorization...");
  const result = await waitForLoginAuthorization(config, startResponse);

  console.log("CodeMap MCP login completed.");
  console.log(`API URL: ${result.apiUrl || config.apiUrl}`);
  if (result.user?.email) {
    console.log(`Email: ${result.user.email}`);
  }
  if (result.user?.name) {
    console.log(`Name: ${result.user.name}`);
  }
}

async function runLogoutCommand() {
  const config = await loadConfig();
  await clearGlobalAuthConfig(config);

  console.log("Cleared CodeMap MCP stored credentials from global config.");
  console.log(`API URL preserved: ${config.apiUrl}`);
}

async function runWhoAmICommand() {
  const config = await loadConfig();

  if (!config.apiToken) {
    console.log("Not authenticated.");
    console.log(`API URL: ${config.apiUrl}`);
    console.log("Run `codemap-mcp login` to authenticate.");
    return;
  }

  const me = await getMcpWhoAmI(createCodeMapClient(config));
  console.log("Authenticated with CodeMap.");
  console.log(`API URL: ${me.apiUrl}`);
  if (me.user.email) {
    console.log(`Email: ${me.user.email}`);
  }
  if (me.user.name) {
    console.log(`Name: ${me.user.name}`);
  }
  if (me.user.id) {
    console.log(`User ID: ${me.user.id}`);
  }
}

async function runStatusCommand() {
  const config = await loadConfig();
  const workspaceConfig = await readWorkspaceProjectConfig();
  const gitInfo = await tryGetCurrentWorkspaceInfo(
    workspaceConfig.workspaceRootPath ?? process.cwd(),
  );
  const store = await readLocalIndex();
  const summary = store?.getSummary();
  const meta = store?.getMeta();
  const indexedAgo = meta?.indexedAt ? formatAge(new Date(meta.indexedAt)) : "never";
  const indexCommit = meta?.commitSha ?? null;
  const indexFresh = Boolean(
    store && (!gitInfo?.commitSha || !indexCommit || gitInfo.commitSha === indexCommit),
  );

  const lines: string[] = ["CodeMap workspace status", ""];
  lines.push(`Workspace: ${workspaceConfig.workspaceRootPath ?? process.cwd()}`);
  lines.push(
    `Git:       ${gitInfo ? `${gitInfo.branch} @ ${gitInfo.commitSha.slice(0, 7)}` : "not available"}`,
  );
  lines.push(`Remote:    ${gitInfo?.remoteUrl ?? "none"}`);
  lines.push("");
  lines.push(
    `Local index: ${store ? (indexFresh ? "fresh" : "stale") : "missing"}`,
  );
  if (summary) {
    lines.push(`  Cache:      ${summary.cachePath}`);
    lines.push(`  Indexed:    ${summary.indexedAt ?? "never"} (${indexedAgo})`);
    lines.push(`  Commit:     ${indexCommit ? indexCommit.slice(0, 7) : "unknown"}`);
    lines.push(`  Files:      ${summary.fileCount}`);
    lines.push(`  Symbols:    ${summary.symbolCount}`);
  } else {
    lines.push("  Run `codemap-mcp local-index` to build the local index.");
  }
  lines.push("");
  lines.push(`Auth:      ${config.apiToken ? "authenticated" : "not authenticated"}`);
  lines.push(`API URL:   ${config.apiUrl}`);
  if (config.user?.email) lines.push(`User:      ${config.user.email}`);
  lines.push("");
  lines.push(
    `Project:   ${workspaceConfig.projectId ? `linked (${workspaceConfig.projectId})` : "not linked"}`,
  );

  if (workspaceConfig.projectId && config.apiToken) {
    const client = createCodeMapClient(config);
    try {
      const project = await client.request<ProjectDetail>(
        `/projects/${encodeURIComponent(workspaceConfig.projectId)}`,
        { authRequired: true },
      );
      const health = await getProjectImportHealth(client, workspaceConfig.projectId, project);
      const latest = health.latestImport;
      lines.push(`  Name:       ${project.name}`);
      lines.push(`  Status:     ${project.status}`);
      lines.push(`  Branch:     ${latest?.branch ?? project.defaultBranch ?? "unknown"}`);
      lines.push(
        `  Cloud:      ${latest ? `${latest.status} / parse ${latest.parseStatus ?? "unknown"}` : "no imports"}`,
      );
      if (latest?.createdAt) lines.push(`  Imported:   ${latest.createdAt}`);
      lines.push(`  Freshness:  ${health.isReady ? "ready" : health.state}${health.isStale ? " (stale)" : ""}`);
      lines.push(`  Next:       ${health.nextAction}`);
    } catch (error) {
      lines.push(
        `  Cloud:      unavailable (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  } else if (workspaceConfig.projectId) {
    lines.push("  Cloud:      skipped (not authenticated)");
  } else {
    lines.push("  Cloud:      not configured");
  }

  console.log(lines.join("\n"));
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => resolve(""), 500);
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString("utf8")); });
    process.stdin.on("error", () => { clearTimeout(timer); resolve(""); });
  });
}

function formatAge(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function runSessionHintCommand() {
  // UserPromptSubmit hook sends JSON { prompt: "..." } via stdin
  let userPrompt = "";
  if (!process.stdin.isTTY) {
    try {
      const raw = await readStdin();
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as { prompt?: string };
        userPrompt = parsed.prompt ?? "";
      }
    } catch { /* not JSON */ }
  }

  const store = await readLocalIndex();
  if (!store) {
    console.log("[CodeMap] No local index found.");
    console.log("→ REQUIRED: Call refresh_local_index before reading or editing files.");
    return;
  }

  const meta = store.getMeta();
  const summary = store.getSummary();
  const projectName = path.basename(summary.workspaceRootPath);
  const indexedAgo = meta?.indexedAt ? formatAge(new Date(meta.indexedAt)) : "never";

  // Stale gate: compare index commit SHA with current HEAD
  let isStale = false;
  if (meta?.commitSha && meta.workspaceRootPath) {
    const gitInfo = await tryGetCurrentWorkspaceInfo(meta.workspaceRootPath).catch(() => null);
    if (gitInfo && gitInfo.commitSha !== meta.commitSha) isStale = true;
  }

  // Broad task detection from user prompt
  const broadTaskPattern = /\b(implement|fix|debug|refactor|investigate|add|create|update|review|build|write|make|change|rename|move|delete|migrate|optimize|improve|deploy|integrate|sửa|thêm|tạo|xóa|làm|viết|đổi|cập nhật)\b/i;
  const isBroadTask = userPrompt.length > 15 && broadTaskPattern.test(userPrompt);

  const lines: string[] = [
    `[CodeMap] ${projectName} · ${summary.fileCount} files · ${summary.symbolCount} symbols · indexed ${indexedAgo}`,
  ];

  if (isStale) {
    lines.push(`⚠ Index is STALE (was at ${meta!.commitSha!.slice(0, 7)}, HEAD has moved). Blast radius data is outdated.`);
    lines.push("→ REQUIRED: Call refresh_local_index before reading or editing files.");
  }

  if (isBroadTask) {
    lines.push("→ REQUIRED: Gather repo context before reading files or editing.");
    lines.push("  Use explore_task when files are unclear; inspect exact files/symbols directly when already known.");
  } else {
    lines.push("→ For broad tasks with unclear files, call explore_task(task) first.");
  }

  console.log(lines.join("\n"));
}

const HIGH_BLAST_THRESHOLD = 10;

async function runPreEditCommand(args: string[]) {
  let filePath: string | null = null;

  const fileArgIdx = args.indexOf("--file");
  if (fileArgIdx >= 0 && args[fileArgIdx + 1]) {
    filePath = args[fileArgIdx + 1] ?? null;
  } else if (!process.stdin.isTTY) {
    try {
      const raw = await readStdin();
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as { tool_input?: { file_path?: string; path?: string } };
        filePath = parsed.tool_input?.file_path ?? parsed.tool_input?.path ?? null;
      }
    } catch {
      // not JSON — skip
    }
  }

  if (!filePath) return;

  const store = await readLocalIndex();
  if (!store) return;

  // Stale gate: compare index commit SHA with current HEAD
  const meta = store.getMeta();
  let isStale = false;
  if (meta?.commitSha && meta.workspaceRootPath) {
    const gitInfo = await tryGetCurrentWorkspaceInfo(meta.workspaceRootPath).catch(() => null);
    if (gitInfo && gitInfo.commitSha !== meta.commitSha) isStale = true;
  }

  const data = store.getFileParse(filePath);
  if (!data) return;

  const lines: string[] = [`[CodeMap] Pre-edit: ${filePath}`];

  if (isStale) {
    lines.push("⚠ INDEX STALE — blast radius below may be inaccurate. Call refresh_local_index first.");
  }

  const resolvedImports = data.imports.filter((i) => i.targetPathText);
  if (resolvedImports.length > 0) {
    const shown = resolvedImports.slice(0, 6).map((i) => path.basename(i.targetPathText!));
    const rest = resolvedImports.length - shown.length;
    lines.push(`Imports (${resolvedImports.length}): ${shown.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`);
  }

  const blastCount = data.blastRadius.totalCount;
  if (blastCount >= HIGH_BLAST_THRESHOLD) {
    const shown = data.blastRadius.files.slice(0, 5).map((f) => path.basename(f.path));
    const rest = blastCount - shown.length;
    lines.push(`⚠ HIGH BLAST RADIUS (${blastCount} files): ${shown.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`);
    lines.push("→ REQUIRED: Call find_related_files or explore_task before editing this file.");
  } else if (blastCount > 0) {
    const shown = data.blastRadius.files.slice(0, 5).map((f) => path.basename(f.path));
    const rest = blastCount - shown.length;
    lines.push(`Blast radius (${blastCount}): ${shown.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`);
  }

  const exportedNames = data.exports.map((e) => e.exportName);
  if (exportedNames.length > 0) {
    const shown = exportedNames.slice(0, 8);
    const rest = exportedNames.length - shown.length;
    lines.push(`Exports: ${shown.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`);
  }

  const hasCycle = store.hasCycle(filePath);
  if (hasCycle) {
    lines.push("⚠ CYCLE DETECTED — this file is in an import cycle. Verify with find_cycles after editing.");
  } else {
    lines.push("Cycle risk: none detected");
  }

  console.log(lines.join("\n"));
}

async function runPreReadCommand() {
  if (process.stdin.isTTY) return;

  let filePath: string | null = null;
  try {
    const raw = await readStdin();
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { tool_input?: { file_path?: string; path?: string } };
      filePath = parsed.tool_input?.file_path ?? parsed.tool_input?.path ?? null;
    }
  } catch {
    return;
  }

  if (!filePath) return;

  const store = await readLocalIndex();
  if (!store) return;

  // Only gate on files that are actually indexed (source files)
  const data = store.getFileParse(filePath);
  if (!data) return;

  const symbolCount = data.symbols.length;
  const exportCount = data.exports.length;

  const lines: string[] = [`[CodeMap] Read gate: ${filePath}`];

  if (symbolCount > 0 || exportCount > 0) {
    lines.push(`This file is indexed — ${symbolCount} symbols, ${exportCount} exports.`);
    lines.push("→ REQUIRED: Use get_file(include=[\"symbols\"], symbol_names=[...]) to read specific symbols.");
    lines.push("  Use get_file(include=[\"outline\"]) to survey the file structure.");
    lines.push("  Only use Read for raw content not available in the index (e.g. config files, templates).");
  }

  console.log(lines.join("\n"));
}

async function runPreBashCommand() {
  if (process.stdin.isTTY) return;

  let command: string | null = null;
  try {
    const raw = await readStdin();
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { tool_input?: { command?: string } };
      command = parsed.tool_input?.command ?? null;
    }
  } catch {
    return;
  }

  if (!command) return;

  // Detect code search patterns — grep/sed/awk/cat/head/tail on source files
  const codeSearchPattern = /\b(grep|rg|awk|sed)\b.*\.(ts|tsx|js|jsx|py|go|rs|java|css|scss)/;
  const rawReadPattern = /\b(cat|head|tail)\b.*\.(ts|tsx|js|jsx|py|go|rs|java)/;

  if (codeSearchPattern.test(command)) {
    console.log("[CodeMap] Bash gate: grep/awk/sed detected on source files.");
    console.log("→ REQUIRED: Use search_codebase(query) for symbol/keyword lookup.");
    console.log("  Use symbol(action=usages) or symbol(action=callers) for impact analysis.");
    console.log("  Use Bash grep only for dynamic access patterns, string literals, or files not in the index.");
    return;
  }

  if (rawReadPattern.test(command)) {
    console.log("[CodeMap] Bash gate: cat/head/tail detected on source files.");
    console.log("→ REQUIRED: Use get_file(include=[\"symbols\"]) or get_file(include=[\"outline\"]) instead.");
    console.log("  Use Read tool only when MCP get_file is insufficient.");
  }
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "login":
      await runLoginCommand();
      return;
    case "logout":
      await runLogoutCommand();
      return;
    case "whoami":
      await runWhoAmICommand();
      return;
    case "status":
      await runStatusCommand();
      return;
    case "init-agent-pack":
      await runInitAgentPackCommand(process.argv.slice(3));
      return;
    case "doctor-agent-pack":
      await runDoctorAgentPackCommand(process.argv.slice(3));
      return;
    case "agent-pack-path":
      runAgentPackPathCommand();
      return;
    case "local-index":
      await runLocalIndexCommand(process.argv.slice(3));
      return;
    case "session-hint":
      await runSessionHintCommand();
      return;
    case "pre-edit":
      await runPreEditCommand(process.argv.slice(3));
      return;
    case "pre-read":
      await runPreReadCommand();
      return;
    case "pre-bash":
      await runPreBashCommand();
      return;
    case "onboarding":
      runOnboardingCommand(process.argv.slice(3));
      return;
    default:
      await runMcpServer();
  }
}

main().catch((error: unknown) => {
  console.error(
    "CodeMap MCP server failed",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
