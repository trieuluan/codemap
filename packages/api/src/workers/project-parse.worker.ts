import path from "node:path";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "../config/load-env";
import type { ProjectParseJobPayload } from "../lib/project-parse-queue.js";

loadEnv();

export async function startProjectParseWorker() {
  const [
    { sql },
    { closeProjectParseQueue, getProjectParseQueueName },
    { runProjectParse },
  ] = await Promise.all([
    import("../db/index.js"),
    import("../lib/project-parse-queue.js"),
    import("../modules/project/parse/runner.js"),
  ]);

  const workerConnection = new IORedis(
    process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
  );

  const worker = new Worker<ProjectParseJobPayload>(
    getProjectParseQueueName(),
    async (job) => {
      return runProjectParse(job.data.importId, { job });
    },
    {
      connection: workerConnection,
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => {
    console.log(`Project parse job completed: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Project parse job failed: ${job?.id ?? "unknown"}`, error);
  });

  async function shutdown(signal: string) {
    console.log(`Shutting down project parse worker on ${signal}`);
    await worker.close();
    await closeProjectParseQueue();
    await workerConnection.quit();
    await sql.end({ timeout: 5 });
  }

  console.log(
    `Project parse worker started on queue "${getProjectParseQueueName()}"`,
  );

  return {
    shutdown,
  };
}

const workerEntryNames = new Set([
  "project-parse.worker.ts",
  "project-parse.worker.js",
]);
const isMainModule = process.argv[1]
  ? workerEntryNames.has(path.basename(process.argv[1]))
  : false;

if (isMainModule) {
  void startProjectParseWorker()
    .then(({ shutdown }) => {
      process.on("SIGINT", () => {
        void shutdown("SIGINT").finally(() => process.exit(0));
      });
      process.on("SIGTERM", () => {
        void shutdown("SIGTERM").finally(() => process.exit(0));
      });
    })
    .catch((error) => {
      console.error("Unable to start project parse worker", error);
      process.exit(1);
    });
}
