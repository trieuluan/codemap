import {
  installAgentPack,
  parseAgentPackInstallArgs,
  cleanAgentPackBackups,
} from "@codemap/core/lib/agent-pack-installer.js";
import { getPluginRoot } from "@codemap/core/lib/agent-pack.js";
import {
  buildAgentPackDoctorMarkdown,
  doctorAgentPack,
  parseAgentPackDoctorArgs,
} from "@codemap/core/lib/agent-pack-doctor.js";
import { buildOnboardingGuide, isOnboardingTarget } from "@codemap/core/lib/onboarding.js";
import { readWorkspacePath } from "@codemap/core/lib/workspace-project.js";

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
