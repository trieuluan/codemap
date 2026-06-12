import { utilityProcess, type BrowserWindow, type UtilityProcess } from "electron";
import { join } from "node:path";
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
  private child: UtilityProcess | null = null;
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
    const child = utilityProcess.fork(join(__dirname, "utility.js"), [], {
      serviceName: `CodeMap Agent: ${this.workspacePath}`,
      stdio: "pipe",
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

  private request<T>(command: UtilityCommand): Promise<T> {
    const requestId =
      command.type === "agent" ? command.command.requestId : command.requestId;
    if (!this.child) {
      return Promise.reject(new Error("Agent runtime is not running"));
    }
    const pending = this.pending.add<T>(requestId);
    this.child.postMessage(command);
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
