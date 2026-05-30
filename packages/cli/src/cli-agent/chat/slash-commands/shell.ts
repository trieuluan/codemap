import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function runShell(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      shell: process.env.SHELL || "/bin/sh",
    });

    return `${stdout}${stderr}`;
  } catch (err) {
    const output = err as { stdout?: string; stderr?: string };
    return `${output.stdout ?? ""}${output.stderr ?? ""}`;
  }
}
