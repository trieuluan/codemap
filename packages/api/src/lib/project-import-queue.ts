import { Queue } from "bullmq";
import IORedis from "ioredis";

export interface ProjectImportJobPayload {
  importId: string;
  projectId: string;
}

let queueInstance: Queue<ProjectImportJobPayload> | null = null;
let connectionInstance: IORedis | null = null;

function getRedisConnection() {
  if (!connectionInstance) {
    connectionInstance = new IORedis(
      process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
    );
  }

  return connectionInstance;
}

export function getProjectImportQueueName() {
  return process.env.IMPORT_QUEUE_NAME ?? "project-imports";
}

export function getProjectImportQueue() {
  if (!queueInstance) {
    queueInstance = new Queue<ProjectImportJobPayload>(getProjectImportQueueName(), {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });
  }

  return queueInstance;
}

export async function enqueueProjectImportJob(payload: ProjectImportJobPayload) {
  return getProjectImportQueue().add("project-import", payload, {
    jobId: payload.importId,
  });
}

export async function closeProjectImportQueue() {
  await queueInstance?.close();
  queueInstance = null;

  if (connectionInstance) {
    await connectionInstance.quit();
    connectionInstance = null;
  }
}
