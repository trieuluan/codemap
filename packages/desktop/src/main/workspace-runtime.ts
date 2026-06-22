import { fork } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { BrowserWindow } from "electron";
import { join, resolve } from "node:path";
import {
  DESKTOP_IPC,
  runtimeMessageSchema,
  type AgentSessionCommand,
  type RuntimeMessage,
  type SettingsMetadata,
  type UtilityCommand,
} from "../shared/ipc.js";
import { RequestTracker } from "./request-tracker.js";

export class WorkspaceRuntime {
  private child: ChildProcess | null = null;
  private pending = new RequestTracker();
  private settings: SettingsMetadata | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(
    private readonly window: BrowserWindow,
    readonly workspacePath: string,
  ) {}

  async start(): Promise<void> {
    if (this.child) return this.readyPromise ?? Promise.resolve();
    this.emitStatus("starting");
    const child = fork(join(__dirname, "utility.cjs"), [], {
      stdio: "pipe",
      env: {
        ...process.env,
        // NODE_PATH lets externalized packages (mastracode, @mastra/*, ai, @ai-sdk/*)
        // be resolved at runtime. They live in runtime-node's node_modules (pnpm hoisting).
        NODE_PATH: [
          resolve(__dirname, "../../node_modules"),
          resolve(__dirname, "../../../../packages/runtime-node/node_modules"),
          resolve(__dirname, "../../../../packages/core/node_modules"),
          resolve(__dirname, "../../../../node_modules"),
        ].join(":"),
      },
    });
    this.child = child;
    child.on("message", (message) => this.handleMessage(message));
    child.on("exit", (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.readyPromise = null;
      this.settings = null;
      const error = new Error(`Agent runtime exited with code ${code ?? "unknown"}`);
      this.pending.rejectAll(error);
      this.emitStatus("disconnected");
    });
    child.stdout?.on("data", (chunk) => {
      console.log(`[desktop utility] ${String(chunk).trim()}`);
    });
    child.stderr?.on("data", (chunk) => {
      console.error(`[desktop utility] ${String(chunk).trim()}`);
    });
    this.readyPromise = this.request<void>({
      type: "initialize",
      requestId: crypto.randomUUID(),
      workspacePath: this.workspacePath,
    });
    try {
      await this.readyPromise;
    } catch (error) {
      if (this.child === child) this.stop();
      throw error;
    }
  }

  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    this.readyPromise = null;
    this.settings = null;
    this.pending.rejectAll(new Error("Agent runtime stopped"));
    child?.kill();
  }

  sendAgentCommand(command: AgentSessionCommand): Promise<unknown> {
    return this.request({ type: "agent", command });
  }

  async readSettings(requestId: string): Promise<SettingsMetadata> {
    if (this.settings) return this.settings;
    return this.request<SettingsMetadata>({
      type: "read_settings",
      requestId,
    });
  }

  getMcpStatus(): Promise<unknown> {
    return this.request({
      type: "get_mcp_status",
      requestId: crypto.randomUUID(),
    });
  }

  getToolsList(): Promise<unknown> {
    return this.request({
      type: "get_tools_list",
      requestId: crypto.randomUUID(),
    });
  }

  runSlashCommand(name: string, args: string): Promise<unknown> {
    return this.request({
      type: "run_slash_command",
      requestId: crypto.randomUUID(),
      name,
      args,
    });
  }

  getAccountInfo(): Promise<unknown> {
    return this.request({
      type: "get_account_info",
      requestId: crypto.randomUUID(),
    });
  }

  accountLogin(): Promise<unknown> {
    return this.request({
      type: "account_login",
      requestId: crypto.randomUUID(),
    });
  }

  accountLogout(): Promise<unknown> {
    return this.request({
      type: "account_logout",
      requestId: crypto.randomUUID(),
    });
  }

  listProjects(): Promise<unknown> {
    return this.request({
      type: "list_projects",
      requestId: crypto.randomUUID(),
    });
  }

  linkProject(projectId: string): Promise<unknown> {
    return this.request({
      type: "link_project",
      requestId: crypto.randomUUID(),
      projectId,
    });
  }

  getAutoIndexStatus(): Promise<unknown> {
    return this.request({
      type: "get_auto_index_status",
      requestId: crypto.randomUUID(),
    });
  }

  enableAutoIndexing(): Promise<unknown> {
    return this.request({
      type: "enable_auto_indexing",
      requestId: crypto.randomUUID(),
    });
  }

  disableAutoIndexing(): Promise<unknown> {
    return this.request({
      type: "disable_auto_indexing",
      requestId: crypto.randomUUID(),
    });
  }

  private request<T>(command: UtilityCommand): Promise<T> {
    const requestId =
      command.type === "agent" ? command.command.requestId : command.requestId;
    if (!this.child) {
      return Promise.reject(new Error("Agent runtime is not running"));
    }
    const pending = this.pending.add<T>(requestId);
    this.child.send(command);
    return pending;
  }

  private handleMessage(raw: unknown): void {
    const parsed = runtimeMessageSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("Ignored invalid utility message", parsed.error);
      return;
    }
    const message: RuntimeMessage = parsed.data;
    if (message.type === "agent_event") {
      this.window.webContents.send(DESKTOP_IPC.event, message);
      return;
    }
    if (message.type === "runtime_status") {
      this.window.webContents.send(DESKTOP_IPC.event, message);
      return;
    }
    if (message.type === "ready") {
      this.settings = message.settings;
      this.emitStatus("ready");
      return;
    }
    if (message.type === "request_error") {
      this.pending.reject(message.requestId, new Error(message.message));
    } else {
      this.pending.resolve(message.requestId, message.result);
    }
  }

  private emitStatus(status: "starting" | "ready" | "disconnected"): void {
    this.window.webContents.send(DESKTOP_IPC.event, {
      type: "runtime_status",
      status,
    } satisfies RuntimeMessage);
  }
}
