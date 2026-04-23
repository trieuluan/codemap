import { spawn } from "node:child_process";

export function isSupportedUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getOpenCommand(url: string) {
  switch (process.platform) {
    case "darwin":
      return {
        command: "open",
        args: [url],
      };
    case "win32":
      return {
        command: "cmd",
        args: ["/c", "start", "", url],
      };
    default:
      return {
        command: "xdg-open",
        args: [url],
      };
  }
}

export async function openUrlInBrowser(url: string) {
  const launcher = getOpenCommand(url);

  const child = spawn(launcher.command, launcher.args, {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}
