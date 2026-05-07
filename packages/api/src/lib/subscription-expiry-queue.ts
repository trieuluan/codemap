import { Queue } from "bullmq";
import type IORedis from "ioredis";

export const SUBSCRIPTION_EXPIRY_QUEUE_NAME = "subscription-expiry";
export const SUBSCRIPTION_EXPIRY_JOB_NAME = "expire-subscriptions";
export const SUBSCRIPTION_EXPIRY_CRON = "0 0 * * *"; // 00:00 UTC daily

let queueInstance: Queue | null = null;
let queueConnection: IORedis | null = null;

export function getSubscriptionExpiryQueue(connection: IORedis) {
  if (!queueInstance || queueConnection !== connection) {
    queueInstance = new Queue(SUBSCRIPTION_EXPIRY_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    });
    queueConnection = connection;
  }
  return queueInstance;
}

export async function closeSubscriptionExpiryQueue() {
  await queueInstance?.close();
  queueInstance = null;
  queueConnection = null;
}
