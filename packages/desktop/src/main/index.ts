import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from "electron";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  DESKTOP_IPC,
  desktopCommandSchema,
  type DesktopCommand,
  type WorkingDiffFile,
} from "../shared/ipc.js";
import { WorkspaceRuntime } from "./workspace-runtime.js";

const runtimes = new Map<number, WorkspaceRuntime>();
const execFileAsync = promisify(execFile);
const DIFF_EXCLUDES = [
  ".",
  ":(exclude)package-lock.json",
  ":(exclude)*.lock",
  ":(exclude)pnpm-lock.yaml",
];

function mapGitStatus(rawStatus: string): WorkingDiffFile["status"] {
  if (rawStatus.startsWith("A")) return "added";
  if (rawStatus.startsWith("D")) return "deleted";
  if (rawStatus.startsWith("R")) return "renamed";
  return "modified";
}

async function gitText(
  workspacePath: string,
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: workspacePath,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout;
}

async function readHeadFile(
  workspacePath: string,
  filePath: string,
): Promise<string> {
  try {
    return await gitText(workspacePath, ["show", `HEAD:${filePath}`]);
  } catch {
    return "";
  }
}

async function readWorkingFile(
  workspacePath: string,
  filePath: string,
): Promise<string> {
  try {
    return await readFile(join(workspacePath, filePath), "utf8");
  } catch {
    return "";
  }
}

function countChangedLines(text: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
}

async function getWorkingDiffFiles(workspacePath: string): Promise<WorkingDiffFile[]> {
  const [nameStatus, numstat] = await Promise.all([
    gitText(workspacePath, ["diff", "--name-status", "HEAD", "--", ...DIFF_EXCLUDES]),
    gitText(workspacePath, ["diff", "--numstat", "HEAD", "--", ...DIFF_EXCLUDES]),
  ]);

  const statsByPath = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [added, deleted, ...paths] = line.split("\t");
    const path = paths.at(-1);
    if (!path) continue;
    statsByPath.set(path, {
      additions: Number.isFinite(Number(added)) ? Number(added) : 0,
      deletions: Number.isFinite(Number(deleted)) ? Number(deleted) : 0,
    });
  }

  const files: WorkingDiffFile[] = [];
  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue;
    const [rawStatus, firstPath, secondPath] = line.split("\t");
    if (!rawStatus || !firstPath) continue;

    const status = mapGitStatus(rawStatus);
    const oldPath = status === "renamed" ? firstPath : undefined;
    const path = status === "renamed" && secondPath ? secondPath : firstPath;
    const originalPath = oldPath ?? path;
    const [original, modified] = await Promise.all([
      status === "added" ? Promise.resolve("") : readHeadFile(workspacePath, originalPath),
      status === "deleted" ? Promise.resolve("") : readWorkingFile(workspacePath, path),
    ]);
    const fallbackStats = countChangedLines(
      await gitText(workspacePath, ["diff", "HEAD", "--", path]).catch(() => ""),
    );
    const stats = statsByPath.get(path) ?? fallbackStats;

    files.push({
      path,
      ...(oldPath ? { oldPath } : {}),
      status,
      original,
      modified,
      additions: stats.additions,
      deletions: stats.deletions,
    });
  }

  return files;
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "CodeMap",
    backgroundColor: "#0b0b0c",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://") && !url.startsWith("http://localhost")) {
      event.preventDefault();
    }
  });
  window.on("closed", () => {
    runtimes.get(window.id)?.stop();
    runtimes.delete(window.id);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return window;
}

ipcMain.handle(DESKTOP_IPC.command, async (event, raw: unknown) => {
  const command = desktopCommandSchema.parse(raw);
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error("Desktop window is unavailable");

  if (command.type === "select_workspace") {
    const selection = await dialog.showOpenDialog(window, {
      title: "Open CodeMap workspace",
      properties: ["openDirectory", "createDirectory"],
    });
    const workspacePath = selection.filePaths[0];
    if (selection.canceled || !workspacePath) return null;
    await attachRuntime(window, workspacePath);
    return workspacePath;
  }

  if (command.type === "open_workspace") {
    await attachRuntime(window, command.workspacePath);
    return command.workspacePath;
  }

  const runtime = runtimes.get(window.id);
  if (!runtime) throw new Error("Open a workspace before starting the agent");

  if (command.type === "agent") {
    return runtime.sendAgentCommand(command.command);
  }
  if (command.type === "read_settings") {
    return runtime.readSettings(command.requestId);
  }
  if (command.type === "get_working_diff") {
    return new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        ["diff", "HEAD", "--", ...DIFF_EXCLUDES],
        { cwd: runtime.workspacePath, maxBuffer: 5 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err && !stdout) {
            reject(new Error(stderr || err.message));
          } else {
            resolve(stdout);
          }
        },
      );
    });
  }
  if (command.type === "get_working_diff_files") {
    return getWorkingDiffFiles(runtime.workspacePath);
  }
  if (command.type === "get_branch_name") {
    return new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        ["branch", "--show-current"],
        { cwd: runtime.workspacePath },
        (err, stdout, stderr) => {
          if (err && !stdout) {
            reject(new Error(stderr || err.message));
          } else {
            resolve(stdout.trim());
          }
        },
      );
    });
  }
  await runtime.restart();
});

async function attachRuntime(
  window: BrowserWindow,
  workspacePath: string,
): Promise<void> {
  runtimes.get(window.id)?.stop();
  const runtime = new WorkspaceRuntime(window, workspacePath);
  runtimes.set(window.id, runtime);
  await runtime.start();
  window.setTitle(`CodeMap - ${workspacePath.split("/").at(-1) ?? workspacePath}`);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
