#!/usr/bin/env node

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
import { runLocalIndexCommand } from "./cli/commands/local-index.js";
import {
  runInitAgentPackCommand,
  runDoctorAgentPackCommand,
  runAgentPackPathCommand,
  runCleanAgentPackBackupsCommand,
  runOnboardingCommand,
} from "./cli/commands/agent-pack.js";
import {
  runSessionHintCommand,
  runPreEditCommand,
  runPreReadCommand,
  runPreBashCommand,
} from "./cli/commands/hooks.js";
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

  // Gateway commands: need LLM gateway config (model routing)
  const GATEWAY_COMMANDS = new Set([
    "chat",
    "models",
    "doctor",
    "help",
  ]);
  if (!command || GATEWAY_COMMANDS.has(command)) {
    const parsed = parseArgs(argv);
    const baseCtx = createBaseContext(argv, parsed, CLI_VERSION);

    if (parsed.command === "help") {
      runHelp(baseCtx);
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
    case "local-index":
      await runLocalIndexCommand(process.argv.slice(3));
      return;
    case "session-hint":
      await runSessionHintCommand();
      return;
    case "pre-edit":
      await runPreEditCommand(process.argv.slice(3));
      return;
    case "pre-read":
      await runPreReadCommand();
      return;
    case "pre-bash":
      await runPreBashCommand();
      return;
    case "onboarding":
      runOnboardingCommand(process.argv.slice(3));
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
