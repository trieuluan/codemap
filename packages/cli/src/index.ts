#!/usr/bin/env -S node --no-warnings

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require("../package.json") as {
  version: string;
};

import {
  runLoginCommand,
  runLogoutCommand,
  runWhoAmICommand,
} from "./cli/commands/auth.js";
import {
  runInitAgentPackCommand,
  runDoctorAgentPackCommand,
  runAgentPackPathCommand,
  runCleanAgentPackBackupsCommand,
} from "./cli/commands/agent-pack.js";
import { parseArgs } from "./cli/args.js";
import { createBaseContext } from "./cli/command-context.js";
import { loadGatewayConfig, hasConfigOrEnvSetup } from "./cli/config.js";
import { loadDotEnv } from "./cli/env.js";
import { runChat } from "./cli/commands/chat.js";
import { runDoctor } from "./cli/commands/doctor.js";
import { runHelp } from "./cli/commands/help.js";
import { runModels } from "./cli/commands/models.js";
import { runInteractiveSetup } from "./agent/setup/index.js";

async function main() {
  const command = process.argv[2];

  await loadDotEnv();

  const argv = process.argv.slice(2);

  // --help / -h flags
  if (command === "--help" || command === "-h") {
    const parsed = parseArgs(["help"]);
    runHelp(createBaseContext(["help"], parsed, CLI_VERSION));
    return;
  }

  // --version / -v flags
  if (command === "--version" || command === "-v") {
    console.log(`CodeMap ${CLI_VERSION}`);
    return;
  }

  // Headless mode: --prompt / -p flag triggers non-interactive execution
  // Must check before command routing since --prompt is a flag, not a command.
  // Scan raw argv directly — parseFlags stops at POSIX "--" separator but
  // pnpm injects "--" before forwarding args, so we must look past it.
  if (argv.includes("--prompt") || argv.includes("-p")) {
    // Extract headless flags from raw argv
    let promptValue: string | undefined;
    let headlessFormat: string | undefined;
    let headlessTimeout: string | undefined;
    let headlessModel: string | undefined;
    let headlessMode: string | undefined;
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--" || arg === "-") continue; // skip POSIX separator, keep scanning
      if (arg === "--prompt" || arg === "-p") {
        promptValue = argv[i + 1];
      } else if (arg === "--format") {
        headlessFormat = argv[i + 1];
      } else if (arg === "--timeout") {
        headlessTimeout = argv[i + 1];
      } else if (arg === "--model") {
        headlessModel = argv[i + 1];
      } else if (arg === "--mode") {
        headlessMode = argv[i + 1];
      }
    }
    if (promptValue) {
      const { loadGatewayConfig: loadGwConfig } = await import("./cli/config.js");
      const headlessConfig = await loadGwConfig();
      if (!headlessConfig.apiKey) {
        const { runInteractiveSetup: setup } = await import("./agent/setup/index.js");
        await setup();
      }
      const { runHeadless: runH } = await import("./cli/commands/headless.js");
      await runH({
        prompt: promptValue,
        format: (headlessFormat as "text" | "json") ?? "text",
        timeout: headlessTimeout ? Number(headlessTimeout) : undefined,
        model: headlessModel,
        mode: (headlessMode as "build" | "plan" | "fast") ?? undefined,
      });
      return;
    }
  }

  // Gateway commands: need LLM gateway config (model routing)
  const GATEWAY_COMMANDS = new Set([
    "chat",
    "models",
    "doctor",
    "help",
    "version",
  ]);
  if (!command || GATEWAY_COMMANDS.has(command)) {
    const parsed = parseArgs(argv);
    const baseCtx = createBaseContext(argv, parsed, CLI_VERSION);

    if (parsed.command === "help") {
      runHelp(baseCtx);
      return;
    }
    if (parsed.command === "version") {
      console.log(`CodeMap ${CLI_VERSION}`);
      return;
    }
    // If no command specified (user just runs `codemap`) and no config exists, run interactive setup
    if (!command && !(await hasConfigOrEnvSetup())) {
      await runInteractiveSetup();
      // After setup, continue with chat
      parsed.command = "chat";
    }

    const config = await loadGatewayConfig();
    const ctx = { ...baseCtx, config };

    switch (parsed.command) {
      case "chat":
        await runChat(ctx);
        return;
      case "models":
        await runModels(ctx);
        return;
      case "doctor":
        await runDoctor(ctx);
        return;
    }
    return;
  }

  // Utility commands: auth, workspace, hooks — don't need gateway config
  switch (command) {
    case "login":
      await runLoginCommand();
      return;
    case "logout":
      await runLogoutCommand();
      return;
    case "whoami":
      await runWhoAmICommand();
      return;
    case "init-agent-pack":
      await runInitAgentPackCommand(process.argv.slice(3));
      return;
    case "doctor-agent-pack":
      await runDoctorAgentPackCommand(process.argv.slice(3));
      return;
    case "agent-pack-path":
      runAgentPackPathCommand();
      return;
    case "clean-agent-pack-backups":
      runCleanAgentPackBackupsCommand(process.argv.slice(3));
      return;
    default:
      console.error(
        `Unknown command: "${command}". Run "codemap help" for usage.`,
      );
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    "CodeMap CLI failed",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
