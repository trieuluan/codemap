#!/usr/bin/env node

import { runCliAgent } from "./cli-agent/index.js";

runCliAgent(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CodeMap LLM Gateway failed: ${message}`);
  process.exitCode = 1;
});
