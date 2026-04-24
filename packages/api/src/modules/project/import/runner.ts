import type { Job } from "bullmq";
import type IORedis from "ioredis";
import simpleGit from "simple-git";
import { db } from "../../../db";
import { enqueueProjectParseJob } from "../../../lib/project-parse-queue";
import { createProjectMapPersistence } from "../map/map-persistence";
import { buildProjectTree } from "../map/tree-builder";
import { createGithubService } from "../../github/service";
import { createProjectService } from "../service";
import { createRepositoryWorkspaceService } from "./repository-workspace";
import {
  materializeRepositorySource,
  resolveRepositorySource,
  validateRepositorySourceAccess,
} from "./source/repository-source";

interface RunProjectImportContext {
  job?: Job;
  redisConnection?: IORedis;
}

const projectService = createProjectService(db);
const projectMapPersistence = createProjectMapPersistence(db);
const repositoryWorkspaceService = createRepositoryWorkspaceService();

function toImportFailureMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Project import failed";
}

async function reportProjectImportProgress(
  context: RunProjectImportContext | undefined,
  progress: number,
  stage: string,
) {
  if (!context?.job) {
    return;
  }

  await context.job.updateProgress({
    progress,
    stage,
  });
}

export async function runProjectImport(
  importId: string,
  context?: RunProjectImportContext,
) {
  const importDetails = await projectService.getImportWithProject(importId);

  if (!importDetails) {
    throw new Error(`Project import not found: ${importId}`);
  }

  const { importRecord, projectRecord } = importDetails;

  if (
    projectRecord.provider !== "github" &&
    projectRecord.provider !== "local_workspace"
  ) {
    await projectService.markImportAsFailed(
      importRecord.id,
      "Project source provider is not configured for this project",
    );
    return;
  }

  if (projectRecord.provider === "github" && !projectRecord.repositoryUrl) {
    await projectService.markImportAsFailed(
      importRecord.id,
      "Repository URL is missing for this GitHub project",
    );
    return;
  }

  // Upload flow: the controller has already extracted the zip directly into
  // .codemap-storage and saved sourceWorkspacePath on the import record.
  // Skip clone/materialize/promote — the source is already in the right place.
  const isPreMaterialized =
    projectRecord.provider === "local_workspace" &&
    Boolean(importRecord.sourceWorkspacePath);

  if (
    !isPreMaterialized &&
    projectRecord.provider === "local_workspace" &&
    !projectRecord.localWorkspacePath
  ) {
    await projectService.markImportAsFailed(
      importRecord.id,
      "Local workspace path is missing for this project",
    );
    return;
  }

  const githubService = createGithubService(db, context?.redisConnection ?? null, {
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    callbackUrl:
      process.env.GITHUB_OAUTH_CALLBACK_URL ??
      `${process.env.BETTER_AUTH_URL}/github/callback`,
  });
  const githubAccessToken =
    projectRecord.provider === "github"
      ? await githubService.getAccessToken(projectRecord.ownerUserId)
      : null;

  let materializedSource: Awaited<
    ReturnType<typeof materializeRepositorySource>
  > | null = null;
  let retainedWorkspacePath: string | null = null;
  // For pre-materialized sources, metadata is already saved by the controller.
  let sourceMetadataSaved = isPreMaterialized;
  let importPhaseCompleted = false;

  try {
    if (isPreMaterialized) {
      // Fast path for uploaded projects: source is already retained in .codemap-storage
      retainedWorkspacePath = importRecord.sourceWorkspacePath!;

      await projectService.markImportAsRunning(importRecord.id, {
        branch: importRecord.branch ?? null,
      });

      await reportProjectImportProgress(context, 60, "scanning-filesystem");
      const tree = await buildProjectTree(
        retainedWorkspacePath,
        projectRecord.name,
      );

      await reportProjectImportProgress(context, 85, "saving-project-map");
      await projectMapPersistence.saveSnapshot({
        projectId: projectRecord.id,
        importId: importRecord.id,
        tree,
      });
    } else {
      await reportProjectImportProgress(context, 10, "validating-repository");
      await validateRepositorySourceAccess(
        projectRecord.provider === "local_workspace"
          ? {
              provider: "local_workspace",
              workspacePath: projectRecord.localWorkspacePath!,
            }
          : {
              provider: "github",
              repositoryUrl: projectRecord.repositoryUrl!,
              accessToken: githubAccessToken,
            },
      );

      await projectService.markImportAsRunning(importRecord.id, {
        branch: importRecord.branch ?? projectRecord.defaultBranch,
      });

      await reportProjectImportProgress(context, 30, "resolving-branch");
      const resolvedSource = await resolveRepositorySource(
        projectRecord.provider === "local_workspace"
          ? {
              provider: "local_workspace",
              workspacePath: projectRecord.localWorkspacePath!,
              preferredBranch: importRecord.branch ?? projectRecord.defaultBranch,
            }
          : {
              provider: "github",
              repositoryUrl: projectRecord.repositoryUrl!,
              preferredBranch: importRecord.branch ?? projectRecord.defaultBranch,
              accessToken: githubAccessToken,
            },
      );

      if (!projectRecord.defaultBranch && resolvedSource.branch) {
        await projectService.setProjectDefaultBranchIfMissing(
          projectRecord.id,
          resolvedSource.branch,
        );
      }

      await reportProjectImportProgress(context, 45, "downloading-source");
      materializedSource = await materializeRepositorySource(resolvedSource, {
        accessToken: githubAccessToken,
      });

      await projectService.markImportAsRunning(importRecord.id, {
        branch: resolvedSource.branch,
      });

      await reportProjectImportProgress(context, 60, "scanning-filesystem");
      const tree = await buildProjectTree(
        materializedSource.workspacePath,
        "repo" in materializedSource.reference
          ? materializedSource.reference.repo
          : materializedSource.reference.repoName,
      );

      await reportProjectImportProgress(context, 85, "saving-project-map");
      await projectMapPersistence.saveSnapshot({
        projectId: projectRecord.id,
        importId: importRecord.id,
        tree,
      });

      await reportProjectImportProgress(context, 92, "retaining-source");
      const retainedWorkspace =
        await repositoryWorkspaceService.promoteStagedWorkspace({
          projectId: projectRecord.id,
          importId: importRecord.id,
          stagedWorkspacePath: materializedSource.workspacePath,
        });
      retainedWorkspacePath = retainedWorkspace.workspacePath;

      // Fetch full history after promote so git diff across commits works
      simpleGit(retainedWorkspace.workspacePath)
        .env("GIT_TERMINAL_PROMPT", "0")
        .fetch(["--unshallow"])
        .catch(() => {});

      await projectService.saveImportSourceMetadata({
        projectImportId: importRecord.id,
        branch: resolvedSource.branch,
        commitSha: materializedSource.commitSha,
        sourceStorageKey: retainedWorkspace.storageKey,
        sourceWorkspacePath: retainedWorkspace.workspacePath,
      });
      sourceMetadataSaved = true;
    }

    await projectService.markImportAsCompleted(importRecord.id);
    importPhaseCompleted = true;

    if (!context?.redisConnection) {
      throw new Error("Redis connection is required to enqueue parse jobs");
    }

    await reportProjectImportProgress(context, 96, "queueing-parse");
    await enqueueProjectParseJob(context.redisConnection, {
      importId: importRecord.id,
    });
    await reportProjectImportProgress(context, 100, "completed");

    const previousSuccessfulImport =
      await projectService.getLatestSuccessfulImportWithSource(
        projectRecord.id,
        {
          excludeImportId: importRecord.id,
        },
      );

    if (previousSuccessfulImport?.sourceWorkspacePath) {
      try {
        await repositoryWorkspaceService.removeWorkspaceByPath(
          previousSuccessfulImport.sourceWorkspacePath,
        );
        await projectService.clearImportSourceMetadata(
          previousSuccessfulImport.id,
        );
      } catch (cleanupError) {
        console.error(
          "Unable to clean up superseded retained project workspace",
          cleanupError,
        );
      }
    }

    try {
      await projectService.deleteSupersededImports(
        projectRecord.id,
        importRecord.id,
      );
    } catch (cleanupError) {
      console.error("Unable to delete superseded project imports", cleanupError);
    }
  } catch (error) {
    if (!importPhaseCompleted && retainedWorkspacePath && !isPreMaterialized) {
      await repositoryWorkspaceService.removeWorkspaceByPath(
        retainedWorkspacePath,
      );

      if (sourceMetadataSaved) {
        await projectService.clearImportSourceMetadata(importRecord.id);
      }
    }

    if (importPhaseCompleted) {
      await projectService.markParseAsFailed(
        importRecord.id,
        toImportFailureMessage(error),
      );
    } else {
      await projectService.markImportAsFailed(
        importRecord.id,
        toImportFailureMessage(error),
      );
    }
    throw error;
  } finally {
    await materializedSource?.cleanup();
  }
}
