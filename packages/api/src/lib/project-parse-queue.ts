import { Queue } from "bullmq";
import type IORedis from "ioredis";

export interface ProjectParseJobPayload {
  importId: string;
}

export const PROJECT_PARSE_JOB_NAME = "project-parse";

let queueInstance: Queue<ProjectParseJobPayload> | null = null;
let queueConnection: IORedis | null = null;

export function getProjectParseQueueName() {
  return process.env.PARSE_QUEUE_NAME ?? "project-parses";
}

export function getProjectParseQueue(connection: IORedis) {
  if (!queueInstance || queueConnection !== connection) {
    queueInstance = new Queue<ProjectParseJobPayload>(getProjectParseQueueName(), {
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

export async function enqueueProjectParseJob(
  connection: IORedis,
  payload: ProjectParseJobPayload,
) {
  return getProjectParseQueue(connection).add(PROJECT_PARSE_JOB_NAME, payload, {
    jobId: payload.importId,
  });
}

export async function getProjectParseJob(
  connection: IORedis,
  importId: string,
) {
  return getProjectParseQueue(connection).getJob(importId);
}

export async function closeProjectParseQueue() {
  await queueInstance?.close();
  queueInstance = null;
  queueConnection = null;
}
