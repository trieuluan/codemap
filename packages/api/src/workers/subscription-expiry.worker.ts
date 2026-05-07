import path from "node:path";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "../config/load-env.js";
import {
  SUBSCRIPTION_EXPIRY_CRON,
  SUBSCRIPTION_EXPIRY_JOB_NAME,
  SUBSCRIPTION_EXPIRY_QUEUE_NAME,
  closeSubscriptionExpiryQueue,
  getSubscriptionExpiryQueue,
} from "../lib/subscription-expiry-queue.js";

loadEnv();

export async function startSubscriptionExpiryWorker() {
  const [{ sql }, { createBillingService }, { db }] = await Promise.all([
    import("../db/index.js"),
    import("../modules/billing/service.js"),
    import("../db/index.js"),
  ]);

  const billingService = createBillingService(db);

  const connection = new IORedis(
    process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    { maxRetriesPerRequest: null, enableReadyCheck: false },
  );

  const queue = getSubscriptionExpiryQueue(connection);

  // Register the daily repeatable job
  await queue.add(SUBSCRIPTION_EXPIRY_JOB_NAME, {}, {
    repeat: { pattern: SUBSCRIPTION_EXPIRY_CRON },
    jobId: `${SUBSCRIPTION_EXPIRY_JOB_NAME}-daily`,
  });

  const worker = new Worker(
    SUBSCRIPTION_EXPIRY_QUEUE_NAME,
    async () => {
      const count = await billingService.expireSubscriptions();
      console.log(`[subscription-expiry] Downgraded ${count} expired subscription(s)`);
    },
    { connection },
  );

  worker.on("failed", (job, error) => {
    console.error(`[subscription-expiry] Job failed: ${job?.id ?? "unknown"}`, error);
  });

  async function shutdown(signal: string) {
    console.log(`Shutting down subscription expiry worker on ${signal}`);
    await worker.close();
    await closeSubscriptionExpiryQueue();
    await connection.quit();
    await sql.end({ timeout: 5 });
  }

  console.log(`Subscription expiry worker started — cron: ${SUBSCRIPTION_EXPIRY_CRON}`);

  return { shutdown };
}

const workerEntryNames = new Set([
  "subscription-expiry.worker.ts",
  "subscription-expiry.worker.js",
]);
const isMainModule = process.argv[1]
  ? workerEntryNames.has(path.basename(process.argv[1]))
  : false;

if (isMainModule) {
  void startSubscriptionExpiryWorker()
    .then(({ shutdown }) => {
      process.on("SIGINT", () => void shutdown("SIGINT").finally(() => process.exit(0)));
      process.on("SIGTERM", () => void shutdown("SIGTERM").finally(() => process.exit(0)));
    })
    .catch((error) => {
      console.error("Unable to start subscription expiry worker", error);
      process.exit(1);
    });
}
