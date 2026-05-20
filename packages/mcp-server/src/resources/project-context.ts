import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { readWorkspaceProjectConfig } from "../lib/workspace-project.js";
import type {
  ProjectDetail,
  ProjectImportDetail,
  WorkspaceDetail,
} from "../lib/api-types.js";
import {
  buildImportHealth,
  describeImportHealth,
  type ImportHealth,
} from "../lib/import-health.js";
import { resolveWorkspace } from "../lib/workspace-resolver.js";

const RESOURCE_URI = "codemap://project/context";

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatProvider(provider: string | null): string {
  if (provider === "github") return "GitHub";
  if (provider === "gitlab") return "GitLab";
  if (provider === "local_workspace") return "Local workspace";
  return "Unknown";
}

// ── Tool lists per tier ───────────────────────────────────────────────────────

const TOOLS_LITE = [
  "- explore_task — starting point for any task; returns likelyFiles, entrypoints, symbols, risks, recommendedReads, and suggestedNextTools in one call",
  "- search_codebase — find files, symbols, and exports by keyword; each result includes a read hint showing the optimal get_file include mode",
  "- get_file — read a file with include modes: content, outline (symbol list), symbols (specific function bodies), blast_radius (impact analysis)",
  "- suggest_edit_locations — candidate generator for likely files/symbols to edit for a natural-language task; each suggestion includes a readPlan",
  "- get_project_map — browse the full file tree",
  "- get_project — get the current linked project from .codemap/mcp.json; call with no arguments",
  "- link_project — link the workspace to an existing CodeMap project; auto-detects by git remote URL",
  "- get_working_diff — show uncommitted changes (staged, unstaged, untracked); use after edits to verify what changed",
  "- refresh_local_index — refresh the local SQLite MCP index from disk; local-only, no auth or cloud API required",
  "- trigger_reimport — run a full cloud import for web graph/insights when the workspace plan allows cloud indexing",
  "- wait_for_import — wait until an import finishes",
  "- check_auth_status — verify MCP authentication, current API URL, user, and next action",
  "- start_auth_flow / wait_for_auth / logout — browser login, API key claim, and local credential reset",
  "- web_search — search the web for documentation, library APIs, changelogs, or error solutions; returns ranked results with URLs",
  "- web_fetch — fetch and read a URL as plain text; auto-converts GitHub blob URLs to raw content and strips HTML; flow: web_search → web_fetch",
  "- get_agent_workflow — load the full agent workflow rules and tool routing guide; call at the start of any broad or multi-step task",
];

const TOOLS_STANDARD_EXTRA = [
  "- get_files — batch outline fetch for up to 7 files in one call; use after suggest_edit_locations to survey candidates",
  "- find_usages — find definitions, occurrence-level usages, and callers for a symbol across the codebase",
  "- find_callers — find static callers of a symbol from a given file; faster than find_usages when file is known",
  "- find_by_pattern — search files by glob or regex pattern with content filtering and line range support",
  "- get_diff — show git diff between two refs (commits, branches, tags)",
  "- get_project_insights — full codebase health report: cycles, entry points, orphans, top files",
  "- run_tests — run the project test suite (Jest, Vitest, Playwright, npm test) with pattern/name filtering",
  "- find_related_files — find files related to a query, file, or symbol using multi-signal ranking",
  "- get_symbol_context — get full body and context for a specific symbol (function, class, method) by name and file",
  "- summarize_feature_area — summarize the purpose, key files, and entry points of a feature area or directory",
  "- recommend_agent_workflow — get a task-specific workflow recommendation with required skills, gates, and artifact templates; call before implementing a broad task",
  "- create_project — create or reuse a CodeMap project from the current workspace",
  "- create_project_from_github — create or reuse a CodeMap project from a GitHub repository",
  "- create_project_from_gitlab — create or reuse a CodeMap project from a gitlab.com repository",
  "- list_projects — list all accessible projects",
];

const TOOLS_FULL_EXTRA = [
  "- move_symbols — move functions/classes from one file to another and auto-update all import statements across the codebase",
  "- rename_symbol — rename a symbol codebase-wide; updates all call sites and imports automatically; call trigger_reimport after",
  "- find_cycles — detect circular dependencies with impact analysis and refactoring recommendations",
  "- code_review — automated code review analyzing bugs, security, performance, style, and complexity",
  "- edit_file — replace a unique string in a file; use for targeted edits (preferred over apply_patch)",
  "- write_file — write full content to a file, creating it if needed; use for new files or full rewrites",
  "- bash — execute shell commands; use for builds, tests, git operations, package installs, or anything other tools don't cover; cwd defaults to workspace root, pass cwd param for sub-packages",
  "- suggest_patch — analyze workspace changes and generate unified diffs with blast radius",
  "- apply_patch — apply a unified diff patch to the workspace after a successful dry-run preflight; supports raw or base64 patches and configurable strip_level (-pN)",
  "- deploy_preview — deploy a preview build of the project",
  "- check_github_connection / get_github_connect_url / disconnect_github — manage GitHub OAuth for repository imports",
  "- check_gitlab_connection / get_gitlab_connect_url / disconnect_gitlab — manage GitLab OAuth for repository imports",
  "- list_github_repositories / search_github_repositories — discover GitHub repositories",
  "- get_current_workspace_info — inspect local git root, branch, commit, and remote before creating/linking a project",
  "- open_url — open a URL in the default browser",
];

// ── Workflow hints per tier ───────────────────────────────────────────────────

const WORKFLOW_LITE = [
  "- Start with check_auth_status if API calls fail or auth is unclear.",
  "- Use get_agent_workflow at the start of any broad or multi-step task to load workflow rules and tool routing.",
  "- Use get_project to confirm the current linked project. If no project is linked, call link_project first (no arguments) — it auto-detects by git remote.",
  "- Use explore_task first for any coding task — returns likelyFiles, entrypoints, symbols, risks, and suggestedNextTools in one call.",
  "- Follow suggestedNextTools returned by explore_task — it provides exact get_file calls to make next.",
  "- Use search_codebase when you know a specific keyword. Follow the read hint in each result.",
  "- Use get_file with include: [\"outline\"] to see a file's symbol list, then include: [\"symbols\"] + symbol_names for specific function bodies.",
  "- Use get_working_diff after making edits to verify what changed before committing.",
  "- Use refresh_local_index after editing files to refresh local MCP search/read context without touching cloud indexing.",
  "- Use trigger_reimport then wait_for_import when you need cloud indexing for web graph/insights.",
  "- Use web_search to find documentation, library APIs, or error solutions. Use web_fetch to read the full content of a result URL.",
];

const WORKFLOW_STANDARD_EXTRA = [
  "- Call recommend_agent_workflow before implementing any broad task — it returns required skills, hard gates, and artifact templates specific to the task type.",
  "- After suggest_edit_locations returns candidates, use get_files to batch-read their outlines in one call, then get_file with include: [\"symbols\"] to deep-dive the specific file to edit.",
  "- Use get_symbol_context to read the full body of a specific function or class when you already know its name and file.",
  "- Use summarize_feature_area to get a high-level overview of a feature directory before diving into individual files.",
  "- Use find_usages to locate definitions, occurrence ranges, and callers when refactoring a symbol. For TypeScript factory patterns (createXxxService etc.), find_usages works directly on method names.",
  "- Use find_callers to check static callers before deleting or refactoring a symbol; treat empty callers as a signal, not proof.",
  "- Use find_related_files with a natural-language query (e.g. 'login bug') to find related files across feature boundaries.",
  "- Use get_project_insights for global signals: orphans, cycles, top fan-out/fan-in files.",
  "- Use run_tests before committing to verify tests pass.",
  "- Use find_by_pattern to search files by glob/regex with content filtering.",
  "- Use get_diff to compare committed refs; use get_working_diff for uncommitted local changes.",
];

const WORKFLOW_FULL_EXTRA = [
  "- Use bash for builds, tests, git commands, and package installs. Pass cwd param when running sub-package commands (e.g. cwd: 'packages/api').",
  "- Use move_symbols to relocate code between files — handles removing from source, appending to dest, and rewriting imports in all callers.",
  "- Use rename_symbol to rename a symbol codebase-wide — call trigger_reimport after. For unexported/private symbols pass rename_in_file_only: true.",
  "- Use find_cycles during architecture review or refactoring planning to identify circular dependency risks.",
  "- Use code_review for automated quality checks. Set focus_areas to target specific concerns (bugs, security, performance, etc.).",
  "- Use suggest_patch to generate a unified diff for proposed changes, then apply_patch to apply it — always review the diff before applying.",
  "- Use deploy_preview after completing a feature to share a testable build.",
];

const MAINTENANCE_SECTION = [
  "## Maintenance / Cleanup Audits",
  "- For dead code, dead files, and large-file cleanup, combine CodeMap semantic tools with local static checks. MCP import graph is the first pass; TypeScript/compiler or ripgrep checks are the confirmation pass.",
  "- Use get_project_insights first for global signals: orphan files, cycles, top fan-out/fan-in files, parse quality, and entry-like files.",
  "- Dead files: check get_file outline importedBy. Empty importedBy is only a candidate. Do not delete route files, Fastify autoload plugins, CLI scripts, worker entrypoints, tests, or generated config files solely because the static graph has no importer.",
  "- Dead functions: use find_usages or find_callers. Empty usage is only a signal; confirm with ripgrep for dynamic string usage before deleting.",
  "- find_usages occurrenceRole: 'definition' = declaration; 'call' = direct call; 'reference' = property access or bare identifier. A symbol with only 'reference' occurrences and no 'call' is likely a config/constant, not dead code.",
  "- After cleanup edits, run package builds and get_working_diff. Call refresh_local_index to refresh MCP local data; call trigger_reimport and wait_for_import only when cloud/web data should refresh.",
  "- Before editing files, use find_cycles to ensure no new circular dependencies are introduced.",
];

// ── Main builder ──────────────────────────────────────────────────────────────

function buildContextText(
  project: ProjectDetail,
  latestImport: ProjectImportDetail | null,
  health: ImportHealth,
  accountWorkspace: WorkspaceDetail | null,
  toolMode: "lite" | "standard" | "full",
): string {
  const lines: string[] = [
    "# CodeMap Project Context",
    "",
    `Project: ${project.name}`,
    `ID: ${project.id}`,
    `Status: ${formatStatus(project.status)}`,
    `Provider: ${formatProvider(project.provider)}`,
  ];

  if (project.repositoryUrl) {
    lines.push(`Repository: ${project.repositoryUrl}`);
  }
  if (project.defaultBranch) {
    lines.push(`Default branch: ${project.defaultBranch}`);
  }
  if (project.description) {
    lines.push(`Description: ${project.description}`);
  }

  lines.push("");

  if (accountWorkspace) {
    lines.push("## Workspace");
    lines.push(`Name: ${accountWorkspace.workspace.name}`);
    lines.push(`Type: ${formatStatus(accountWorkspace.workspace.type)}`);
    lines.push(`Plan: ${formatStatus(accountWorkspace.workspace.plan)}`);
    lines.push(`Role: ${formatStatus(accountWorkspace.membership.role)}`);
    lines.push(
      `Usage: ${accountWorkspace.usage.projectCount} project(s), ` +
        `${accountWorkspace.usage.importsThisMonth} import(s) this month`,
    );
    lines.push(
      `Entitlements: projects ${accountWorkspace.entitlements.maxProjects ?? "unlimited"}, ` +
        `imports/month ${accountWorkspace.entitlements.maxImportsPerMonth ?? "unlimited"}, ` +
        `MCP ${accountWorkspace.entitlements.mcpAccess ? "enabled" : "disabled"}, ` +
        `cloud import ${accountWorkspace.entitlements.cloudImportAccess ? "enabled" : "disabled"}`,
    );
    lines.push("");
  }

  if (latestImport) {
    lines.push("## Latest Import");
    lines.push(`Status: ${formatStatus(latestImport.status)}`);
    lines.push(`Parse: ${formatStatus(latestImport.parseStatus)}`);
    if (latestImport.branch) lines.push(`Branch: ${latestImport.branch}`);
    if (latestImport.commitSha) {
      lines.push(`Commit: ${latestImport.commitSha.slice(0, 8)}`);
    }
    if (latestImport.completedAt) {
      lines.push(
        `Completed: ${new Date(latestImport.completedAt).toLocaleString()}`,
      );
    }
    if (latestImport.errorMessage) {
      lines.push(`Import error: ${latestImport.errorMessage}`);
    }
    if (latestImport.parseError) {
      lines.push(`Parse error: ${latestImport.parseError}`);
    }
  } else {
    lines.push("## Import Status");
    lines.push("No imports found. Run trigger_reimport to index the codebase.");
  }

  lines.push("");
  lines.push("## Index Health");
  lines.push(describeImportHealth(health));

  lines.push("");
  lines.push("## Supported Languages");
  lines.push("CodeMap parses and indexes symbols from the following languages:");
  lines.push("- TypeScript / JavaScript (.ts, .tsx, .js, .jsx) — classes, functions, interfaces, imports, exports; methods inside factory return-objects (e.g. createXxxService, createXxxController patterns) are also indexed as kind=method with parentSymbolName pointing to the factory — find_usages works for these without needing grep");
  lines.push("- Dart (.dart) — classes, mixins, enums, imports");
  lines.push("- PHP (.php) — namespaces, classes, interfaces, traits, functions, use statements");
  lines.push("- Python (.py) — classes, functions, methods, import/from-import statements");
  lines.push("- Gettext (.po) — indexed by path only (no symbol extraction); use get_file with start_line/end_line to read specific ranges of large translation files without loading the full content");
  lines.push("All other file types are indexed by path only (no symbol extraction).");
  lines.push("");
  lines.push("## Symbol Occurrence Tracking (TypeScript/JS)");
  lines.push("find_usages returns occurrences with occurrenceRole that indicates how a symbol appears:");
  lines.push("- definition — where the symbol is declared");
  lines.push("- call — direct function/method call: foo(), obj.method()");
  lines.push("- reference — property access (OBJ.prop) or bare identifier usage (CONST in array/arg)");
  lines.push("Cross-file calls are resolved via named imports ({ foo } from '...'). Wildcard imports (import * as ns) are also resolved: ns.foo() maps to foo in the target module.");
  lines.push("Known false negatives — find_usages may show 0 callers for symbols used via:");
  lines.push("- Dynamic import: import('../lib/foo.js') with no importedNames — workers often use this pattern");
  lines.push("- Framework registration: Fastify route handlers registered via object destructuring, not direct calls");
  lines.push("- Runtime/dynamic access: obj[methodName], eval, require with variable path");
  lines.push("Always cross-check with Bash grep before concluding a symbol is dead.");

  // ── Available Tools (filtered by toolMode) ──────────────────────────────────
  lines.push("");
  lines.push("## Available Tools");
  const toolList = [
    ...TOOLS_LITE,
    ...(toolMode === "standard" || toolMode === "full" ? TOOLS_STANDARD_EXTRA : []),
    ...(toolMode === "full" ? TOOLS_FULL_EXTRA : []),
  ];
  toolList.forEach((t) => lines.push(t));

  lines.push("");
  lines.push("## Structured Tool Responses");
  lines.push("Most CodeMap MCP tools return both human-readable text and structured data:");
  lines.push("- summary — short text for humans and fallback clients");
  lines.push("- data — machine-readable source of truth for agent workflow decisions");
  lines.push("- isError — only for unexpected tool/API failures");
  lines.push("");
  lines.push(
    "Prefer structuredContent.data when deciding what to do next. Do not parse " +
      "summary text when data has an explicit field such as authenticated, " +
      "connected, found, total, status, parseStatus, timedOut, or completed.",
  );
  lines.push(
    "Valid states such as no results, missing project link, not authenticated, " +
      "not connected, or import already running may be returned as successful " +
      "tool results with data fields explaining the state.",
  );

  lines.push("");
  lines.push("## Instructions");

  if (
    project.status === "ready" &&
    latestImport?.parseStatus === "completed" &&
    !health.isStale
  ) {
    lines.push(
      "The codebase is fully indexed. Use search_codebase to locate files and " +
        "symbols before answering questions about the code.",
    );
  } else if (health.isStale) {
    if (accountWorkspace?.entitlements.cloudImportAccess === false) {
      lines.push(
        "The local workspace commit differs from the latest cloud indexed commit, " +
          "but cloud imports are disabled for this workspace. Call refresh_local_index " +
          "before relying on local MCP search or symbol results for recent code changes.",
      );
    } else {
      lines.push(
        "The local workspace commit differs from the latest cloud indexed commit. " +
          "Call refresh_local_index for local MCP work, or trigger_reimport then " +
          "wait_for_import when web graph/insights should update.",
      );
    }
  } else if (project.status === "importing") {
    if (latestImport?.parseStatus === "queued") {
      lines.push(
        "The import phase is complete and the parse job is queued. " +
          "Call wait_for_import to wait for semantic analysis before relying " +
          "on symbol/export results.",
      );
    } else {
      lines.push(
        "An import is currently in progress. Use wait_for_import to wait until " +
          "it completes before searching the codebase.",
      );
    }
  } else if (
    project.status === "ready" &&
    latestImport?.parseStatus !== "completed"
  ) {
    if (latestImport?.parseStatus === "queued") {
      lines.push(
        "The codebase snapshot is ready and the parse job is queued. " +
          "Call wait_for_import to wait for semantic analysis before relying " +
          "on symbol/export results.",
      );
    } else {
      lines.push(
        "The codebase snapshot is ready but semantic analysis is still running " +
          `(parse status: ${latestImport?.parseStatus ?? "unknown"}). ` +
          "File search is available but symbol/export results may be incomplete.",
      );
    }
  } else {
    lines.push(
      "The project has not been fully imported in the cloud yet. Use refresh_local_index " +
        "for local MCP indexing, or trigger_reimport to create cloud graph/insights " +
        "when the workspace plan allows it.",
    );
  }

  // ── Recommended Workflow (filtered by toolMode) ──────────────────────────────
  lines.push("");
  lines.push("## Recommended Workflow");
  const workflow = [
    ...WORKFLOW_LITE,
    ...(toolMode === "standard" || toolMode === "full" ? WORKFLOW_STANDARD_EXTRA : []),
    ...(toolMode === "full" ? WORKFLOW_FULL_EXTRA : []),
  ];
  workflow.forEach((w) => lines.push(w));

  // ── Maintenance (full mode only) ──────────────────────────────────────────
  if (toolMode === "full") {
    lines.push("");
    MAINTENANCE_SECTION.forEach((m) => lines.push(m));
  }

  return lines.join("\n");
}

export function registerProjectContextResource(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerResource(
    "project-context",
    RESOURCE_URI,
    {
      title: "CodeMap Project Context",
      description:
        "Current state of the linked CodeMap project: import status, parse status, " +
        "and instructions for searching the codebase. Read this resource at the start " +
        "of every session to understand the project before answering questions about the code.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const workspaceConfig = await readWorkspaceProjectConfig();
      const projectId = workspaceConfig.projectId;

      if (!projectId) {
        // Check auth locally — no API call, just check if a token is configured
        const isAuthenticated = Boolean(config.apiToken);

        const noProjectText = isAuthenticated
          ? [
              "# CodeMap Project Context",
              "",
              "## Status: Logged in — local workspace, no cloud project linked",
              "",
              "You are logged in to CodeMap. Local MCP tools work right now without a cloud project.",
              "",
              "## What works locally (no cloud project needed)",
              "- refresh_local_index — build/refresh local SQLite index from disk; required before search/read tools work",
              "- explore_task, search_codebase, get_file, get_files, find_usages, find_callers — full codebase navigation",
              "- edit_file, write_file, bash — code editing and shell commands",
              "- web_search, web_fetch — search the web and fetch URLs; no auth required",
              "- get_working_diff — see uncommitted changes",
              "",
              "## Recommended first step",
              "Call refresh_local_index now (no arguments) to build the local index. After that, you can search and navigate the codebase immediately.",
              "",
              "## Cloud project (optional — only needed for web features)",
              "A cloud project is only required if the user asks about:",
              "- Dependency graph on the web dashboard",
              "- Insights (orphan files, circular deps, top files) on the web",
              "- Sharing project analysis with teammates",
              "",
              "Do NOT proactively suggest creating a cloud project. Only bring it up if the user explicitly asks for graph, insights, or web dashboard features.",
              "If the user does want a cloud project: call link_project first (auto-detects by git remote). Only call create_project if link_project finds no match.",
              "",
              "CodeMap MCP tools use structured responses. Prefer structuredContent.data for workflow decisions.",
            ].join("\n")
          : [
              "# CodeMap Project Context",
              "",
              "## Status: Not logged in — local tools still available",
              "",
              "The user has not logged in to CodeMap yet.",
              "",
              "## What works right now (no login needed)",
              "- refresh_local_index — build local index from disk; no auth required",
              "- After indexing: explore_task, search_codebase, get_file, get_files, find_usages — full local navigation",
              "- edit_file, write_file, bash — code editing and shell commands",
              "- web_search, web_fetch — search the web and fetch URLs; no auth required",
              "",
              "## Recommended first step",
              "Call refresh_local_index now to build the local index. The user can start working immediately.",
              "",
              "## Login (only needed for cloud features)",
              "Login is only required for: graph/insights on the web dashboard, cloud project sync, or team features.",
              "If the user wants to login: call start_auth_flow (opens browser), then wait_for_auth.",
              "Do NOT push the user to login unless they ask for cloud/web features.",
              "",
              "CodeMap MCP tools use structured responses. Prefer structuredContent.data for workflow decisions.",
            ].join("\n");

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: noProjectText,
            },
          ],
        };
      }

      let project: ProjectDetail;
      let imports: ProjectImportDetail[];

      try {
        [project, imports] = await Promise.all([
          client.request<ProjectDetail>(
            `/projects/${encodeURIComponent(projectId)}`,
            { authRequired: true },
          ),
          client.request<ProjectImportDetail[]>(
            `/projects/${encodeURIComponent(projectId)}/imports`,
            { authRequired: true },
          ),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `# CodeMap Project Context\n\nFailed to load project context: ${message}`,
            },
          ],
        };
      }

      const latestImport = imports[0] ?? null;
      const resolvedWorkspace = await resolveWorkspace({ project });
      const accountWorkspace = project.workspaceId
        ? await client
            .request<WorkspaceDetail>(
              `/workspaces/${encodeURIComponent(project.workspaceId)}`,
              { authRequired: true },
            )
            .catch(() => null)
        : null;
      const health = buildImportHealth({
        latestImport,
        workspace: resolvedWorkspace.workspace,
        workspaceResolution: resolvedWorkspace.resolution,
        project,
      });

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: buildContextText(project, latestImport, health, accountWorkspace, config.toolMode),
          },
        ],
      };
    },
  );
}
