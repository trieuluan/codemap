import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from "electron";
import { join } from "node:path";
import { execFile } from "node:child_process";
import {
  DESKTOP_IPC,
  desktopCommandSchema,
  type DesktopCommand,
} from "../shared/ipc.js";
import { WorkspaceRuntime } from "./workspace-runtime.js";

const runtimes = new Map<number, WorkspaceRuntime>();

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
        ["diff", "HEAD", "--", ".", ":(exclude)package-lock.json", ":(exclude)*.lock", ":(exclude)pnpm-lock.yaml"],
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
