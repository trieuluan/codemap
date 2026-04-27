import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { ProjectDetail, ProjectImportDetail } from "../lib/api-types.js";
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
  if (provider === "local_workspace") return "Local workspace";
  return "Unknown";
}

function buildContextText(
  project: ProjectDetail,
  latestImport: ProjectImportDetail | null,
  health: ImportHealth,
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
  lines.push("- TypeScript / JavaScript (.ts, .tsx, .js, .jsx) — classes, functions, interfaces, imports, exports");
  lines.push("- Dart (.dart) — classes, mixins, enums, imports");
  lines.push("- PHP (.php) — namespaces, classes, interfaces, traits, functions, use statements");
  lines.push("- Python (.py) — classes, functions, methods, import/from-import statements");
  lines.push("- Gettext (.po) — indexed by path only (no symbol extraction); use get_file with start_line/end_line to read specific ranges of large translation files without loading the full content");
  lines.push("All other file types are indexed by path only (no symbol extraction).");

  lines.push("");
  lines.push("## Translation Workflow");
  lines.push("When working with .po translation files (e.g. for Frappe/ERPNext custom apps):");
  lines.push("- Use get_project_map to locate .po files in the project (e.g. locale/vi.po)");
  lines.push("- Use get_file with start_line/end_line to read specific sections of a .po file — never load the full file as it can be several MB");
  lines.push("- To find untranslated strings: read the .po file in chunks and look for entries where msgstr is empty (\"\")");
  lines.push("- Use search_codebase to find Python/JS source files that contain the original string for context before translating");
  lines.push("- Write translated msgstr back to the .po file using targeted edits — do not rewrite the whole file");

  lines.push("");
  lines.push("## Available Tools");
  lines.push("- check_auth_status — verify MCP authentication, current API URL, user, GitHub status, and next action");
  lines.push("- start_auth_flow / wait_for_auth / logout — browser login, API key claim, and local credential reset");
  lines.push("- check_github_connection / get_github_connect_url / disconnect_github — manage optional GitHub access for repository imports");
  lines.push("- list_projects — list all accessible projects");
  lines.push("- get_project — get current project status and metadata");
  lines.push("- get_current_workspace_info — inspect local git root, branch, commit, and remote before creating/linking a project");
  lines.push("- create_project — create or reuse a CodeMap project from the current workspace");
  lines.push("- create_project_from_github — create or reuse a CodeMap project from a GitHub repository");
  lines.push("- list_github_repositories / search_github_repositories — discover GitHub repositories available to the authenticated user");
  lines.push("- get_project_map — browse the full file tree");
  lines.push("- search_codebase — find files, symbols, and exports by keyword; each result includes a read hint (→ get_file ...) showing the optimal include mode to use next");
  lines.push("- suggest_edit_locations — deterministic candidate generator for likely files and symbols to inspect/edit for a natural-language task; each suggestion includes a readPlan field specifying the optimal get_file include mode (symbols/outline/content) — always follow readPlan instead of defaulting to content");
  lines.push("- get_file — read a file with include modes: content, outline (symbol list), symbols (extract specific symbol bodies by name), blast_radius (impact analysis). Auto-reparses if local file has changed since last import.");
  lines.push("- get_files — batch outline fetch for up to 7 files in a single call; use after suggest_edit_locations to survey multiple candidates before deciding where to edit");
  lines.push("- get_project_insights — full codebase health report: cycles, entry points, orphans, top files");
  lines.push("- get_diff — show git diff between two refs (commits, branches, tags); useful for understanding recent changes");
  lines.push("- move_symbols — move functions/classes from one file to another and auto-update all import statements across the codebase");
  lines.push("- find_callers — find static callers/usages of a symbol from a given file, with occurrence ranges, evidence, confidence, and parse staleness metadata");
  lines.push("- find_usages — find definitions, occurrence-level usages, and callers for a symbol across the codebase, with confidence metadata");
  lines.push("- rename_symbol — rename a function, class, or variable across the entire codebase using the parse index; updates all call sites and import statements automatically; call trigger_reimport after. Use rename_in_file_only: true for unexported symbols. Does not rename files or handle dynamic access like obj[\"methodName\"].");
  lines.push("- get_working_diff — show uncommitted changes in the local workspace (staged, unstaged, untracked); use this after edits to verify what changed before committing or reimporting. Add include_patch: true to see full diff content per file.");
  lines.push("- trigger_reimport — re-index the codebase after code changes");
  lines.push("- wait_for_import — wait until an import finishes");

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
    lines.push(
      "The local workspace commit differs from the latest indexed commit. " +
        "Call trigger_reimport, then wait_for_import before relying on search " +
        "or symbol results for recent code changes.",
    );
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
      "The project has not been fully imported yet. Run trigger_reimport to " +
        "index the codebase.",
    );
  }

  lines.push("");
  lines.push("## Recommended Workflow");
  lines.push("- Start with check_auth_status if API calls fail or auth is unclear.");
  lines.push("- If not authenticated, call start_auth_flow and then wait_for_auth after the user approves the browser prompt.");
  lines.push("- If GitHub access is needed and disconnected, call get_github_connect_url; GitHub is optional for MCP auth but required for private GitHub repository imports.");
  lines.push("- Use get_project or list_projects to confirm the active project.");
  lines.push("- If get_project reports health.nextAction as trigger_reimport, call trigger_reimport and then wait_for_import.");
  lines.push("- If get_project reports health.nextAction as wait_for_import, call wait_for_import before relying on search or symbol tools.");
  lines.push("- If no project is linked, call create_project first; it will detect GitHub remotes or ask for upload confirmation.");
  lines.push("- Use get_current_workspace_info before create_project when linking the current workspace.");
  lines.push("- Use suggest_edit_locations first for broad implementation tasks when you do not already know the relevant files. Each suggestion includes a readPlan — always use it to call get_file with the right include mode instead of defaulting to content. Treat results as candidates, not final truth; prefer high-confidence entries.");
  lines.push("- Use search_codebase before reading files when looking for symbols, exports, or feature code. Each result includes a read hint (→ get_file ...) — follow it directly instead of calling get_file with content.");
  lines.push("- After suggest_edit_locations returns multiple candidates, use get_files to survey all of them in one batch call (outline only), then use get_file with include: [\"symbols\"] to deep-dive the specific file you need to edit.");
  lines.push("- Use get_file with include: [\"outline\"] first to see a file's symbol list, then include: [\"symbols\"] with symbol_names to fetch only the bodies you need — avoids loading the full file.");
  lines.push("- Add blast_radius to get_file before risky edits to shared files, services, schemas, or MCP tools; do not request blast_radius for routine file reading.");
  lines.push("- Use find_callers to check static callers before deleting or refactoring a symbol; treat empty callers as a signal, not proof, because external/runtime usages may exist.");
  lines.push("- Use find_usages to locate definitions, occurrence ranges, caller evidence, and confidence metadata when refactoring a symbol.");
  lines.push("- Use move_symbols to relocate code between files — it handles removing from source, appending to dest, and rewriting imports in all callers.");
  lines.push("- Use rename_symbol to rename a symbol codebase-wide — provide the definition file and current name; it uses the parse index to find all occurrences and rewrites imports automatically. Call trigger_reimport after. For unexported/private symbols pass rename_in_file_only: true to avoid false positives in unrelated files.");
  lines.push("- Use get_working_diff after making edits to verify which files changed before committing or reimporting; prefer get_diff for comparing committed refs.");
  lines.push("- If suggest/search results look stale, a new file is missing, or local edits changed semantics, call trigger_reimport, then wait_for_import.");
  lines.push("- If search or suggest_edit_locations returns no useful results, retry with narrower domain terms, call get_project_map to inspect folders, or reimport if the index may be stale.");

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
      const projectId = await readWorkspaceProjectId();

      if (!projectId) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: [
                "# CodeMap Project Context",
                "",
                "No project linked to this workspace.",
                "",
                "Run one of the following tools to link a project:",
                "- create_project — import a local folder",
                "- create_project_from_github — import a GitHub repository",
                "",
                "CodeMap MCP tools use structured responses. Prefer structuredContent.data for workflow decisions and treat summary text as a human-readable fallback.",
              ].join("\n"),
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
            text: buildContextText(project, latestImport, health),
          },
        ],
      };
    },
  );
}
