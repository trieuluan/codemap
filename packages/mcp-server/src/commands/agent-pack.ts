import {
  installAgentPack,
  parseAgentPackInstallArgs,
  cleanAgentPackBackups,
} from "../lib/agent-pack-installer.js";
import { getPluginRoot } from "../lib/agent-pack.js";
import {
  buildAgentPackDoctorMarkdown,
  doctorAgentPack,
  parseAgentPackDoctorArgs,
} from "../lib/agent-pack-doctor.js";
import { buildOnboardingGuide, isOnboardingTarget } from "../lib/onboarding.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

export async function runInitAgentPackCommand(args: string[]): Promise<void> {
  const options = parseAgentPackInstallArgs(args);
  const result = await installAgentPack({
    ...options,
    cwd: options.cwd ?? await readWorkspacePath(),
  });

  console.log(`${result.dryRun ? "Previewed" : "Installed"} CodeMap Agent Pack for target: ${result.target}`);
  console.log(`Root: ${result.root}`);
  console.log(`Pack: ${result.packRoot}`);
  console.log(`Plugin root: ${result.pluginRoot}`);
  for (const item of result.installed) {
    console.log(`- ${item.action}: ${item.path}`);
  }
  console.log("");
  const doctorTarget = result.target === "marketplace" ? "auto" : result.target;
  console.log(`Verify with: codemap doctor-agent-pack --target ${doctorTarget} --root ${result.root}`);

  if (!result.dryRun) {
    const target = result.target;
    if (isOnboardingTarget(target) || target === "all") {
      console.log("");
      console.log(buildOnboardingGuide(target));
    }
  }
}

export async function runDoctorAgentPackCommand(args: string[]): Promise<void> {
  const options = parseAgentPackDoctorArgs(args);
  const result = await doctorAgentPack({
    root: options.cwd ?? await readWorkspacePath(),
    target: options.target,
  });
  console.log(buildAgentPackDoctorMarkdown(result));
  if (result.status === "fail") {
    process.exitCode = 1;
  }
}

export function runAgentPackPathCommand(): void {
  console.log(getPluginRoot());
}

export async function runCleanAgentPackBackupsCommand(args: string[]): Promise<void> {
  const rootIdx = args.indexOf("--root");
  const root = rootIdx >= 0 && args[rootIdx + 1]
    ? args[rootIdx + 1]!
    : await readWorkspacePath();
  const dryRun = args.includes("--dry-run");
  try {
    await cleanAgentPackBackups(root, dryRun);
  } catch (err: unknown) {
    console.error("Failed:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export function runOnboardingCommand(args: string[]): void {
  let target = "all";
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--target" || args[i] === "-t") && args[i + 1]) {
      target = args[i + 1] ?? "all";
      break;
    }
    if (args[i]?.startsWith("--target=")) {
      target = args[i]!.slice("--target=".length);
      break;
    }
  }

  if (!isOnboardingTarget(target) && target !== "all") {
    console.error(`Unknown target: ${target}`);
    console.error("Valid targets: claude, cursor, codex, gemini, opencode, copilot, all");
    process.exitCode = 1;
    return;
  }
  console.log(buildOnboardingGuide(target));
}
