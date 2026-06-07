import path from "node:path";
import { z } from "zod";
import { uuidSchema } from "@codemap-ai/core/lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "@codemap-ai/core/config.js";
import { createCodeMapClient } from "@codemap-ai/core/lib/codemap-api.js";
import { success, withToolError } from "@codemap-ai/core/lib/tool-response.js";
import { zipWorkspaceFolder } from "@codemap-ai/core/lib/workspace-zip.js";
import { saveWorkspaceProjectId, readWorkspaceProjectId } from "@codemap-ai/core/lib/workspace-project.js";
import { resolveWorkspace } from "@codemap-ai/core/lib/workspace-resolver.js";
import type { GithubStatus, ProjectSourceImportResult } from "@codemap-ai/core/lib/api-types.js";

type CodeMapClient = ReturnType<typeof createCodeMapClient>;

function detectGitProvider(remoteUrl: string): "github" | "gitlab" {
  return remoteUrl.includes("gitlab") ? "gitlab" : "github";
}

// ── Private helpers (extracted from former create-project-from-*.ts files) ─────

async function createProjectFromGithub(
  client: CodeMapClient,
  params: {
    repository_url: string;
    name?: string;
    description?: string;
    external_repo_id?: string;
    default_branch?: string;
    branch?: string;
    workspace_id?: string;
    is_private?: boolean;
  },
) {
  const {
    repository_url,
    name,
    description,
    external_repo_id,
    default_branch,
    branch,
    workspace_id,
    is_private,
  } = params;

  const existingProjectId = await readWorkspaceProjectId();
  if (existingProjectId) {
    return { alreadyLinked: true as const, projectId: existingProjectId };
  }

  const result = await client.request<ProjectSourceImportResult>(
    "/projects/from-github",
    {
      method: "POST",
      body: {
        repositoryUrl: repository_url,
        name,
        description,
        externalRepoId: external_repo_id,
        defaultBranch: default_branch,
        branch,
        workspaceId: workspace_id,
      },
      authRequired: true,
    },
  );

  const resolvedWorkspace = await resolveWorkspace({ project: result.project });
  await saveWorkspaceProjectId(resolvedWorkspace.workspaceRootPath, result.project.id);

  return {
    alreadyLinked: false as const,
    project: result.project,
    import: result.import,
    source: {
      provider: "github" as const,
      repositoryUrl: repository_url,
      externalRepoId: external_repo_id ?? null,
      defaultBranch: default_branch ?? null,
      branch: branch ?? null,
      workspaceId: workspace_id ?? null,
    },
  };
}

async function createProjectFromGitlab(
  client: CodeMapClient,
  params: {
    repository_url: string;
    access_token?: string;
    name?: string;
    description?: string;
    default_branch?: string;
    branch?: string;
    workspace_id?: string;
  },
) {
  const {
    repository_url,
    access_token,
    name,
    description,
    default_branch,
    branch,
    workspace_id,
  } = params;

  const existingProjectId = await readWorkspaceProjectId();
  if (existingProjectId) {
    return { alreadyLinked: true as const, projectId: existingProjectId };
  }

  const result = await client.request<ProjectSourceImportResult>(
    "/projects/from-gitlab",
    {
      method: "POST",
      body: {
        repositoryUrl: repository_url,
        accessToken: access_token,
        name,
        description,
        defaultBranch: default_branch,
        branch,
        workspaceId: workspace_id,
      },
      authRequired: true,
    },
  );

  const resolvedWorkspace = await resolveWorkspace({ project: result.project });
  await saveWorkspaceProjectId(resolvedWorkspace.workspaceRootPath, result.project.id);

  return {
    alreadyLinked: false as const,
    project: result.project,
    import: result.import,
    source: {
      provider: "gitlab" as const,
      repositoryUrl: repository_url,
      defaultBranch: default_branch ?? null,
      branch: branch ?? null,
      workspaceId: workspace_id ?? null,
    },
  };
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerCreateProjectTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "create_project",
    {
      title: "Create Project",
      description:
        "Smart entry point for creating a CodeMap project. " +
        "If `repository_url` is provided, creates the project from that GitHub/GitLab repository directly. " +
        "Otherwise, auto-detects from the workspace git remote. " +
        "If there is no git remote — or no git at all — the workspace folder will be zipped and uploaded to CodeMap for analysis. " +
        "Sensitive files (.env*, *.pem, *.key, .aws/, .ssh/, secrets.*, etc.) and artifact directories (node_modules, dist, .next, etc.) " +
        "are automatically excluded before upload. " +
        "For the upload path, the tool will ask the user to confirm before sending any code.",
      inputSchema: {
        repository_url: z
          .string()
          .trim()
          .url()
          .max(500)
          .optional()
          .describe(
            "Full HTTPS URL of a GitHub or GitLab repository. " +
              "When provided, creates the project from this repo directly regardless of workspace git remote. " +
              "Provider is auto-detected from the URL.",
          ),
        access_token: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .optional()
          .describe(
            "Personal access token with read_repository scope. Required for private GitLab repositories.",
          ),
        external_repo_id: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .optional()
          .describe("External repository ID from the git provider."),
        is_private: z
          .boolean()
          .optional()
          .describe(
            "Whether the repository is private. Enforces privateRepoImports entitlement.",
          ),
        default_branch: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .optional()
          .describe("Default branch of the repository."),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().min(1).max(500).optional(),
        branch: z.string().trim().min(1).max(255).optional(),
        workspace_id: uuidSchema
          .optional()
          .describe(
            "Optional CodeMap workspace UUID. If omitted, CodeMap uses the user's default personal workspace.",
          ),
        upload_confirmed: z
          .boolean()
          .optional()
          .describe(
            "Set to true only after the user has explicitly agreed to upload the source code to CodeMap.",
          ),
      },
    },
    withToolError(async ({
      repository_url,
      access_token,
      external_repo_id,
      is_private,
      default_branch,
      name,
      description,
      branch,
      workspace_id,
      upload_confirmed,
    }) => {
      // Guard: refuse to create if a project already exists for this workspace.
      // Creating a new project would overwrite the projectId in .codemap/mcp.json,
      // breaking all existing CodeMap tools for this workspace.
      const existingProjectId = await readWorkspaceProjectId();
      if (existingProjectId && !repository_url) {
        return success(
          `This workspace is already linked to CodeMap project \`${existingProjectId}\`.\n` +
          `Use \`reimport\` to re-sync, or \`link_project\` to switch to a different project.\n` +
          `Do NOT call create_project again — it would overwrite the existing project link.`,
          { projectId: existingProjectId },
        );
      }

      // ── Path 0: explicit repository_url → direct remote import ────────────
      if (repository_url) {
        const provider = detectGitProvider(repository_url);

        if (provider === "gitlab") {
          const gitlabResult = await createProjectFromGitlab(client, {
            repository_url,
            access_token,
            name,
            description,
            default_branch,
            branch,
            workspace_id,
          });

          if (gitlabResult.alreadyLinked) {
            return success(
              `This workspace is already linked to CodeMap project \`${gitlabResult.projectId}\`.\n` +
              `Use \`reimport\` to re-sync the existing project instead.`,
              { projectId: gitlabResult.projectId },
            );
          }

          const summary = [
            "GitLab source project import started successfully.",
            `Project: ${gitlabResult.project.name} (${gitlabResult.project.id})`,
            `Provider: gitlab`,
            gitlabResult.project.repositoryUrl
              ? `Repository: ${gitlabResult.project.repositoryUrl}`
              : null,
            `Import: ${gitlabResult.import.id}`,
            `Branch: ${gitlabResult.import.branch ?? branch ?? "default"}`,
            `Import status: ${gitlabResult.import.status}`,
            `Parse status: ${gitlabResult.import.parseStatus}`,
            "Next action: call reimport until indexing is ready.",
          ]
            .filter(Boolean)
            .join("\n");

          return success(summary, {
            created: true,
            actionRequired: null,
            source: gitlabResult.source,
            project: gitlabResult.project,
            import: gitlabResult.import,
            workspaceProjectIdSaved: true,
            nextAction: "reimport",
          });
        }

        // GitHub — check connection for private repos
        if (is_private) {
          const githubStatus = await client.request<GithubStatus>("/github/status", {
            authRequired: true,
          });

          if (!githubStatus.connected) {
            return success(
              "GitHub is not connected to this CodeMap account.\n\n" +
              "For private repositories, please connect GitHub first:\n" +
              "  1. Call manage_git_connection with provider='github' and action='connect'\n" +
              "  2. Complete the authorization flow.\n" +
              "  3. Call create_project again.\n\n" +
              "If the repository is public, call create_project again without is_private.",
              {
                created: false,
                actionRequired: "connect_github",
                source: {
                  provider: "github",
                  repositoryUrl: repository_url,
                  branch: branch ?? null,
                },
                project: null,
                import: null,
                nextAction: "manage_git_connection",
              },
            );
          }
        }

        const githubResult = await createProjectFromGithub(client, {
          repository_url,
          name,
          description,
          external_repo_id,
          default_branch,
          branch,
          workspace_id,
          is_private,
        });

        if (githubResult.alreadyLinked) {
          return success(
            `This workspace is already linked to CodeMap project \`${githubResult.projectId}\`.\n` +
            `Use \`reimport\` to re-sync the existing project instead.`,
            { projectId: githubResult.projectId },
          );
        }

        const summary = [
          "GitHub source project import started successfully.",
          `Project: ${githubResult.project.name} (${githubResult.project.id})`,
          `Provider: github`,
          githubResult.project.repositoryUrl
            ? `Repository: ${githubResult.project.repositoryUrl}`
            : null,
          `Import: ${githubResult.import.id}`,
          `Branch: ${githubResult.import.branch ?? branch ?? "default"}`,
          `Import status: ${githubResult.import.status}`,
          `Parse status: ${githubResult.import.parseStatus}`,
          "Next action: call reimport until indexing is ready.",
        ]
          .filter(Boolean)
          .join("\n");

        return success(summary, {
          created: true,
          actionRequired: null,
          source: githubResult.source,
          project: githubResult.project,
          import: githubResult.import,
          workspaceProjectIdSaved: true,
          nextAction: "reimport",
        });
      }

      const resolvedWorkspace = await resolveWorkspace();
      const workspace = resolvedWorkspace.workspace;

      // ── Path A: workspace has a git remote → clone flow ────────────────────
      if (workspace?.remoteUrl) {
        const provider = detectGitProvider(workspace.remoteUrl);

        // GitLab repos: delegate to the GitLab helper
        if (provider === "gitlab") {
          const gitlabResult = await createProjectFromGitlab(client, {
            repository_url: workspace.remoteUrl,
            name,
            description,
            workspace_id,
            default_branch: workspace.branch,
            branch: branch ?? workspace.branch,
          });

          if (gitlabResult.alreadyLinked) {
            return success(
              `This workspace is already linked to CodeMap project \`${gitlabResult.projectId}\`.\n` +
              `Use \`reimport\` to re-sync the existing project instead.`,
              { projectId: gitlabResult.projectId },
            );
          }

          const summary = [
            "Project import started from GitLab repository.",
            `Project: ${gitlabResult.project.name} (${gitlabResult.project.id})`,
            `Repository: ${workspace.remoteUrl}`,
            `Branch: ${gitlabResult.import.branch ?? workspace.branch}`,
            `Import status: ${gitlabResult.import.status}`,
            `Parse status: ${gitlabResult.import.parseStatus}`,
            "",
            `Project ID saved to workspace — future tools will use it automatically.`,
            "Next action: call reimport until indexing is ready.",
          ].join("\n");

          return success(summary, {
            created: true,
            actionRequired: null,
            source: {
              provider: "gitlab",
              repositoryUrl: workspace.remoteUrl,
              branch: gitlabResult.import.branch ?? workspace.branch,
              workspaceRootPath: workspace.repoRootPath ?? process.cwd(),
            },
            project: gitlabResult.project,
            import: gitlabResult.import,
            workspaceProjectIdSaved: true,
            nextAction: "reimport",
          });
        }

        // GitHub flow: check connection status first
        const githubStatus = await client.request<GithubStatus>("/github/status", {
          authRequired: true,
        });

        if (!githubStatus.connected) {
          const summary = [
            "GitHub is not connected to this CodeMap account.",
            "",
            "For private repositories, please connect GitHub first:",
            "  1. Call manage_git_connection with provider='github' and action='connect' — it will open the browser automatically.",
            "  2. Complete the authorization flow.",
            "  3. Call create_project again.",
            "",
            "If the repository is public, you can also call create_project directly",
            `with repository_url: "${workspace.remoteUrl}".`,
          ].join("\n");

          return success(summary, {
            created: false,
            actionRequired: "connect_github",
            source: {
              provider: "github",
              repositoryUrl: workspace.remoteUrl,
              branch: branch ?? workspace.branch,
            },
            project: null,
            import: null,
            nextAction: "manage_git_connection",
          });
        }

        // Delegate to the extracted GitHub helper
        const githubResult = await createProjectFromGithub(client, {
          repository_url: workspace.remoteUrl,
          name,
          description,
          workspace_id,
          default_branch: workspace.branch,
          branch: branch ?? workspace.branch,
        });

        if (githubResult.alreadyLinked) {
          return success(
            `This workspace is already linked to CodeMap project \`${githubResult.projectId}\`.\n` +
            `Use \`reimport\` to re-sync the existing project instead.`,
            { projectId: githubResult.projectId },
          );
        }

        const summary = [
          "Project import started from GitHub repository.",
          `Project: ${githubResult.project.name} (${githubResult.project.id})`,
          `Repository: ${workspace.remoteUrl}`,
          `Branch: ${githubResult.import.branch ?? workspace.branch}`,
          `Import status: ${githubResult.import.status}`,
          `Parse status: ${githubResult.import.parseStatus}`,
          "",
          `Project ID saved to workspace — future tools will use it automatically.`,
          "Next action: call reimport until indexing is ready.",
        ].join("\n");

        return success(summary, {
          created: true,
          actionRequired: null,
          source: {
            provider: "github",
            repositoryUrl: workspace.remoteUrl,
            branch: githubResult.import.branch ?? workspace.branch,
            workspaceRootPath: workspace.repoRootPath ?? process.cwd(),
          },
          project: githubResult.project,
          import: githubResult.import,
          workspaceProjectIdSaved: true,
          nextAction: "reimport",
        });
      }

      // ── Path B: no git remote → upload flow ────────────────────────────────
      const folderPath = workspace?.repoRootPath ?? process.cwd();
      const folderName = name ?? path.basename(folderPath) ?? "uploaded-project";

      if (!upload_confirmed) {
        const summary = [
          `This workspace has no git remote (${folderPath}).`,
          "CodeMap needs to upload the source code to analyze it.",
          "",
          "The following will be automatically excluded before upload:",
          "  • Artifact directories: node_modules, dist, build, .next, .git, coverage, .turbo, etc.",
          "  • Sensitive files: .env*, *.pem, *.key, *.p12, *.pfx, *.keystore, secrets.*, credentials.*, etc.",
          "  • Sensitive directories: .aws/, .ssh/, .gnupg/",
          "  • Files listed in .gitignore",
          "",
          "Do you consent to uploading this source code to CodeMap for analysis?",
          "Call create_project again with upload_confirmed: true to proceed.",
        ].join("\n");

        return success(summary, {
          created: false,
          actionRequired: "confirm_upload",
          source: {
            provider: "upload",
            folderPath,
            name: folderName,
          },
          project: null,
          import: null,
          uploadConfirmed: false,
          nextAction: "link_or_create_project",
        });
      }

      // User confirmed — zip and upload
      const { buffer, addedCount, skippedSensitive } = await zipWorkspaceFolder(folderPath);

      if (addedCount === 0) {
        return success(
          "No files to upload after applying exclusion filters. Check that the workspace folder contains source files.",
          {
            created: false,
            actionRequired: "add_source_files",
            source: {
              provider: "upload",
              folderPath,
              name: folderName,
            },
            project: null,
            import: null,
            filesIncluded: 0,
            excludedSensitive: skippedSensitive,
          },
        );
      }

      const query: Record<string, string | undefined> = {
        name: folderName,
        description,
        branch,
        workspaceId: workspace_id,
      };

      const result = await client.upload<ProjectSourceImportResult>(
        "/projects/from-upload",
        buffer,
        { query, authRequired: true },
      );

      await saveWorkspaceProjectId(folderPath, result.project.id).catch(() => undefined); // non-fatal

      const summary = [
        "Source code uploaded and project import started.",
        `Project: ${result.project.name} (${result.project.id})`,
        `Files included: ${addedCount}`,
        skippedSensitive.length > 0
          ? `Excluded sensitive files/dirs: ${skippedSensitive.join(", ")}`
          : null,
        `Branch: ${result.import.branch ?? branch ?? "main"}`,
        `Import status: ${result.import.status}`,
        `Parse status: ${result.import.parseStatus}`,
        "",
        `Project ID saved to workspace — future tools will use it automatically.`,
        "Next action: call reimport until indexing is ready.",
      ]
        .filter(Boolean)
        .join("\n");

      return success(summary, {
        created: true,
        actionRequired: null,
        source: {
          provider: "upload",
          folderPath,
          name: folderName,
          branch: result.import.branch ?? branch ?? "main",
        },
        project: result.project,
        import: result.import,
        filesIncluded: addedCount,
        excludedSensitive: skippedSensitive,
        workspaceProjectIdSaved: true,
        nextAction: "reimport",
      });
    }),
  );
}
