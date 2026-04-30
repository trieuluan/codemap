import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { resolveWorkspace } from "../lib/workspace-resolver.js";
import {
  readWorkspaceProjectId,
  saveWorkspaceProjectId,
} from "../lib/workspace-project.js";
import type { Project } from "../lib/api-types.js";

function normalizeRemoteUrl(url: string) {
  return url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .toLowerCase();
}

function remoteUrlsMatch(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return normalizeRemoteUrl(a) === normalizeRemoteUrl(b);
}

function formatProjectList(projects: Project[]) {
  return projects
    .map((p, i) => {
      const repo = p.repositoryUrl ? ` — ${p.repositoryUrl}` : "";
      return `  ${i + 1}. ${p.name} (${p.status})${repo}\n     ID: ${p.id}`;
    })
    .join("\n");
}

async function maybePatchProjectRepo(
  client: ReturnType<typeof createCodeMapClient>,
  project: Project,
  remoteUrl: string | null,
  branch: string | null | undefined,
): Promise<{ patched: boolean; updatedProject: Project }> {
  if (project.repositoryUrl || !remoteUrl) {
    return { patched: false, updatedProject: project };
  }

  const body: Record<string, string> = { repositoryUrl: remoteUrl };
  if (branch) body.defaultBranch = branch;

  const updatedProject = await client.request<Project>(`/projects/${project.id}`, {
    method: "PATCH",
    body,
    authRequired: true,
  });

  return { patched: true, updatedProject };
}

export function registerLinkProjectTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "link_project",
    {
      title: "Link Project",
      description:
        "Links the current workspace to an existing CodeMap project. " +
        "If called without arguments, CodeMap checks whether the workspace git remote matches any existing project " +
        "and suggests it automatically. If no match is found, it lists all projects so the user can pick one. " +
        "Pass project_id to confirm the link directly. " +
        "If the linked project has no repository URL, CodeMap will ask whether to update it with the workspace remote and branch.",
      inputSchema: {
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("UUID of the project to link. Omit to trigger auto-detection."),
        confirm: z
          .boolean()
          .optional()
          .describe("Set to true to confirm linking the auto-detected matching project."),
        update_repo: z
          .boolean()
          .optional()
          .describe(
            "Set to true to update the linked project's repositoryUrl and defaultBranch " +
            "with the current workspace remote and branch.",
          ),
      },
    },
    withToolError(async ({ project_id, confirm, update_repo }) => {
      const resolvedWorkspace = await resolveWorkspace();
      const workspaceRootPath = resolvedWorkspace.workspaceRootPath;
      const remoteUrl = resolvedWorkspace.workspace?.remoteUrl ?? null;
      const branch = resolvedWorkspace.workspace?.branch ?? null;

      // ── Helper: build post-link message ─────────────────────────────────────
      function buildLinkedResult(project: Project, autoMatched = false) {
        const needsRepo = !project.repositoryUrl && remoteUrl;

        const lines = [
          `Workspace linked to project "${project.name}".`,
          `Project ID saved to .codemap/mcp.json — future tools will use it automatically.`,
        ];

        if (needsRepo) {
          lines.push(
            ``,
            `This project has no repository linked yet.`,
            `Would you like to update it with:`,
            `  Repository: ${remoteUrl}`,
            ...(branch ? [`  Branch:     ${branch}`] : []),
            ``,
            `Call link_project again with update_repo: true to apply.`,
          );
        }

        return success(lines.filter((l) => l !== null).join("\n"), {
          linked: true,
          project,
          workspaceRootPath,
          autoMatched,
          pendingRepoUpdate: needsRepo
            ? { repositoryUrl: remoteUrl, defaultBranch: branch }
            : null,
        });
      }

      // ── update_repo: patch repository info on already-linked project ─────────
      if (update_repo) {
        const currentProjectId = await readWorkspaceProjectId(workspaceRootPath);
        if (!currentProjectId) {
          return success(
            "No project is linked to this workspace yet. Call link_project first.",
            { linked: false, patched: false },
          );
        }

        const project = await client.request<Project>(`/projects/${currentProjectId}`, {
          authRequired: true,
        });

        const { patched, updatedProject } = await maybePatchProjectRepo(
          client,
          project,
          remoteUrl,
          branch,
        );

        if (!patched) {
          const reason = project.repositoryUrl
            ? `Project already has a repository: ${project.repositoryUrl}`
            : "Workspace has no git remote to link.";
          return success(reason, { linked: true, patched: false, project });
        }

        return success(
          [
            `Project "${updatedProject.name}" updated.`,
            `  Repository: ${updatedProject.repositoryUrl}`,
            updatedProject.defaultBranch
              ? `  Branch:     ${updatedProject.defaultBranch}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
          { linked: true, patched: true, project: updatedProject },
        );
      }

      // ── Explicit project_id: link directly ───────────────────────────────────
      if (project_id) {
        const project = await client.request<Project>(`/projects/${project_id}`, {
          authRequired: true,
        });

        await saveWorkspaceProjectId(workspaceRootPath, project.id);
        return buildLinkedResult(project);
      }

      // ── No project_id: fetch all projects and attempt auto-match ─────────────
      const projects = await client.request<Project[]>("/projects", {
        authRequired: true,
      });

      if (projects.length === 0) {
        return success(
          "No projects found. Use create_project to create one first.",
          { linked: false, projects: [], autoMatch: null },
        );
      }

      // Already linked?
      const currentProjectId = await readWorkspaceProjectId(workspaceRootPath);
      if (currentProjectId) {
        const current = projects.find((p) => p.id === currentProjectId);
        if (current) {
          return success(
            [
              `This workspace is already linked to "${current.name}" (${current.id}).`,
              `To switch, call link_project with a different project_id.`,
              ``,
              `Available projects:`,
              formatProjectList(projects),
            ].join("\n"),
            { linked: true, project: current, projects, alreadyLinked: true },
          );
        }
      }

      // Try to auto-match by git remote URL
      const matched = remoteUrl
        ? projects.find((p) => remoteUrlsMatch(p.repositoryUrl, remoteUrl))
        : null;

      if (matched) {
        if (confirm) {
          await saveWorkspaceProjectId(workspaceRootPath, matched.id);
          return buildLinkedResult(matched, true);
        }

        return success(
          [
            `Found a matching project for this workspace:`,
            `  "${matched.name}" (${matched.status}) — ID: ${matched.id}`,
            `  Repository: ${matched.repositoryUrl}`,
            ``,
            `Do you want to link this workspace to "${matched.name}"?`,
            `Call link_project again with confirm: true to proceed, or pass a project_id to pick a different project.`,
          ].join("\n"),
          {
            linked: false,
            autoMatch: matched,
            projects,
            nextAction: "confirm_or_pick",
          },
        );
      }

      // No match — show full list
      return success(
        [
          remoteUrl
            ? `No project found matching remote URL: ${remoteUrl}`
            : `This workspace has no git remote.`,
          ``,
          `Your projects:`,
          formatProjectList(projects),
          ``,
          `Call link_project with project_id: "<id>" to link one, or use create_project to create a new one.`,
        ].join("\n"),
        {
          linked: false,
          autoMatch: null,
          projects,
          nextAction: "pick_or_create",
        },
      );
    }),
  );
}
