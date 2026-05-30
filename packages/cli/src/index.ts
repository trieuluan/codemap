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
} from "./commands/auth.js";
import { runStatusCommand } from "./commands/status.js";
import { runLocalIndexCommand } from "./commands/local-index.js";
import {
  runInitAgentPackCommand,
  runDoctorAgentPackCommand,
  runAgentPackPathCommand,
  runCleanAgentPackBackupsCommand,
  runOnboardingCommand,
} from "./commands/agent-pack.js";
import {
  runSessionHintCommand,
  runPreEditCommand,
  runPreReadCommand,
  runPreBashCommand,
} from "./commands/hooks.js";
import { parseArgs } from "./cli-agent/args.js";
import { createBaseContext } from "./cli-agent/command-context.js";
import { loadGatewayConfig, hasConfigOrEnvSetup } from "./cli-agent/config.js";
import { loadDotEnv } from "./cli-agent/env.js";
import { runAsk } from "./commands/ask.js";
import { runChat } from "./commands/chat.js";
import { runDoctor } from "./commands/doctor.js";
import { runHelp } from "./commands/help.js";
import { runInitGateway } from "./commands/init-gateway.js";
import { runModels } from "./commands/models.js";
import { runRouteCommand } from "./commands/route.js";
import { runInteractiveSetup } from "./cli-agent/first-run-setup.js";

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
    "ask",
    "route",
    "models",
    "doctor",
    "init-gateway",
    "help",
  ]);
  if (!command || GATEWAY_COMMANDS.has(command)) {
    const parsed = parseArgs(argv);
    const baseCtx = createBaseContext(argv, parsed, CLI_VERSION);

    if (parsed.command === "help") {
      runHelp(baseCtx);
      return;
    }
    if (parsed.command === "init-gateway") {
      await runInitGateway(baseCtx);
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
      case "ask":
        await runAsk(ctx);
        return;
      case "route":
        runRouteCommand(ctx);
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
    case "status":
      await runStatusCommand();
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
