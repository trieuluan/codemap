import { startProjectImportWorker } from "./project-import.worker.js";
import { startProjectParseWorker } from "./project-parse.worker.js";

async function startWorkers() {
  const [importWorker, parseWorker] = await Promise.all([
    startProjectImportWorker(),
    startProjectParseWorker(),
  ]);

  let isShuttingDown = false;

  async function shutdown(signal: string) {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    console.log(`Shutting down worker bundle on ${signal}`);

    await Promise.allSettled([
      importWorker.shutdown(signal),
      parseWorker.shutdown(signal),
    ]);
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT").finally(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM").finally(() => process.exit(0));
  });

  console.log("Project workers bundle started");
}

void startWorkers().catch((error) => {
  console.error("Unable to start project workers bundle", error);
  process.exit(1);
});
