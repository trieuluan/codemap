import { Worker } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "../config/load-env";
import type { ProjectImportJobPayload } from "../lib/project-import-queue.js";

loadEnv();

function toImportFailureMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Import job failed";
}

async function fetchRepository(projectId: string, repositoryUrl: string) {
  const response = await fetch(repositoryUrl, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "user-agent": `codemap-import-worker/${projectId}`,
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Repository fetch failed with status ${response.status} ${response.statusText}`.trim(),
    );
  }

  await response.arrayBuffer();
}

async function startWorker() {
  const [{ db, sql }, { createProjectService }, queueLib] = await Promise.all([
    import("../db/index.js"),
    import("../modules/project/service.js"),
    import("../lib/project-import-queue.js"),
  ]);

  const {
    closeProjectImportQueue,
    getProjectImportQueueName,
  } = queueLib;

  const service = createProjectService(db);
  const workerConnection = new IORedis(
    process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
  );

  const worker = new Worker<ProjectImportJobPayload>(
    getProjectImportQueueName(),
    async (job) => {
      const importDetails = await service.getImportWithProject(job.data.importId);

      if (!importDetails) {
        return;
      }

      const { importRecord, projectRecord } = importDetails;

      if (!projectRecord.repositoryUrl) {
        await service.markImportAsFailed(
          importRecord.id,
          "Repository URL is missing for this project",
        );
        return;
      }

      await service.markImportAsRunning(importRecord.id);

      try {
        await fetchRepository(projectRecord.id, projectRecord.repositoryUrl);
        await service.markImportAsCompleted(importRecord.id);
      } catch (error) {
        await service.markImportAsFailed(
          importRecord.id,
          toImportFailureMessage(error),
        );
        throw error;
      }
    },
    {
      connection: workerConnection,
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => {
    console.log(`Project import job completed: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Project import job failed: ${job?.id ?? "unknown"}`, error);
  });

  async function shutdown(signal: string) {
    console.log(`Shutting down project import worker on ${signal}`);
    await worker.close();
    await closeProjectImportQueue();
    await workerConnection.quit();
    await sql.end();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.log(
    `Project import worker started on queue "${getProjectImportQueueName()}"`,
  );
}

void startWorker().catch((error) => {
  console.error("Unable to start project import worker", error);
  process.exit(1);
});
