import type { Job } from "bullmq";
import { db } from "../../db";
import { createProjectMapPersistence } from "./map-persistence";
import { buildProjectTree } from "./tree-builder";
import { createProjectService } from "../project/service";
import {
  materializeRepositorySource,
  resolveRepositorySource,
  validateRepositorySourceAccess,
} from "./repository-source";

interface RunProjectImportContext {
  job?: Job;
}

const projectService = createProjectService(db);
const projectMapPersistence = createProjectMapPersistence(db);

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

  if (!projectRecord.repositoryUrl) {
    await projectService.markImportAsFailed(
      importRecord.id,
      "Repository URL is missing for this project",
    );
    return;
  }

  let materializedSource:
    | Awaited<ReturnType<typeof materializeRepositorySource>>
    | null = null;

  try {
    await reportProjectImportProgress(context, 10, "validating-repository");
    await validateRepositorySourceAccess(projectRecord.repositoryUrl);

    await projectService.markImportAsRunning(importRecord.id, {
      branch: importRecord.branch ?? projectRecord.defaultBranch,
    });

    await reportProjectImportProgress(context, 30, "resolving-branch");
    const resolvedSource = await resolveRepositorySource({
      repositoryUrl: projectRecord.repositoryUrl,
      preferredBranch: importRecord.branch ?? projectRecord.defaultBranch,
    });

    if (!projectRecord.defaultBranch) {
      await projectService.setProjectDefaultBranchIfMissing(
        projectRecord.id,
        resolvedSource.branch,
      );
    }

    await reportProjectImportProgress(context, 45, "downloading-source");
    materializedSource = await materializeRepositorySource(resolvedSource);

    await projectService.markImportAsRunning(importRecord.id, {
      branch: resolvedSource.branch,
    });

    await reportProjectImportProgress(context, 60, "scanning-filesystem");
    const tree = await buildProjectTree(
      materializedSource.workspacePath,
      materializedSource.reference.repo,
    );

    await reportProjectImportProgress(context, 85, "saving-project-map");
    await projectMapPersistence.saveSnapshot({
      projectId: projectRecord.id,
      importId: importRecord.id,
      tree,
    });

    await reportProjectImportProgress(context, 100, "completed");
    await projectService.markImportAsCompleted(importRecord.id);
  } catch (error) {
    await projectService.markImportAsFailed(
      importRecord.id,
      toImportFailureMessage(error),
    );
    throw error;
  } finally {
    await materializedSource?.cleanup();
  }
}
