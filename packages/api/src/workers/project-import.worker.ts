import { Worker } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "../config/load-env";
import type { ProjectImportJobPayload } from "../lib/project-import-queue.js";

loadEnv();

async function startWorker() {
  const [
    { sql },
    { closeProjectImportQueue, getProjectImportQueueName },
    { runProjectImport },
  ] = await Promise.all([
    import("../db/index.js"),
    import("../lib/project-import-queue.js"),
    import("../modules/project-import/runner.js"),
  ]);

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
      return runProjectImport(job.data.importId, { job });
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
