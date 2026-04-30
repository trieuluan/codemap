import { Queue } from "bullmq";
import type IORedis from "ioredis";

export interface ProjectImportJobPayload {
  importId: string;
}

export const PROJECT_IMPORT_JOB_NAME = "project-import";

let queueInstance: Queue<ProjectImportJobPayload> | null = null;
let queueConnection: IORedis | null = null;

export function getProjectImportQueueName() {
  return process.env.IMPORT_QUEUE_NAME ?? "project-imports";
}

export function getProjectImportQueue(connection: IORedis) {
  if (!queueInstance || queueConnection !== connection) {
    queueInstance = new Queue<ProjectImportJobPayload>(getProjectImportQueueName(), {
      connection,
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
    queueConnection = connection;
  }

  return queueInstance;
}

export async function enqueueProjectImportJob(
  connection: IORedis,
  payload: ProjectImportJobPayload,
) {
  return getProjectImportQueue(connection).add(PROJECT_IMPORT_JOB_NAME, payload, {
    jobId: payload.importId,
  });
}

export async function closeProjectImportQueue() {
  await queueInstance?.close();
  queueInstance = null;
  queueConnection = null;
}
