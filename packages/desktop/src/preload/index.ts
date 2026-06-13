import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentSessionEvent,
  DesktopApi,
  RuntimeMessage,
} from "../shared/ipc.js";
import { DESKTOP_IPC, runtimeMessageSchema } from "../shared/ipc.js";

const invoke = <T>(command: unknown): Promise<T> =>
  ipcRenderer.invoke(DESKTOP_IPC.command, command) as Promise<T>;

const api: DesktopApi = {
  openWorkspace: () =>
    invoke({
      type: "select_workspace",
      requestId: crypto.randomUUID(),
    }),
  send: (content, options = {}) => {
    const requestId = crypto.randomUUID();
    return invoke({
      type: "agent",
      command: {
        type: "send",
        requestId,
        input: { content, ...options },
      },
    });
  },
  abort: () => {
    const requestId = crypto.randomUUID();
    return invoke({
      type: "agent",
      command: { type: "abort", requestId },
    });
  },
  listThreads: () => {
    const requestId = crypto.randomUUID();
    return invoke({
      type: "agent",
      command: { type: "list_threads", requestId },
    });
  },
  switchThread: (threadId) => {
    const requestId = crypto.randomUUID();
    return invoke({
      type: "agent",
      command: { type: "switch_thread", requestId, threadId },
    });
  },
  newThread: () => {
    const requestId = crypto.randomUUID();
    return invoke({
      type: "agent",
      command: { type: "new_thread", requestId },
    });
  },
  deleteThread: (threadId) => {
    const requestId = crypto.randomUUID();
    return invoke({
      type: "agent",
      command: { type: "delete_thread", requestId, threadId },
    });
  },
  respondToApproval: (approvalId, decision) => {
    const requestId = crypto.randomUUID();
    return invoke({
      type: "agent",
      command: {
        type: "respond_approval",
        requestId,
        response: { requestId, approvalId, decision },
      },
    });
  },
  respondToQuestion: (questionId, answer) => {
    const requestId = crypto.randomUUID();
    return invoke({
      type: "agent",
      command: {
        type: "respond_question",
        requestId,
        response: { requestId, questionId, answer },
      },
    });
  },
  readSettings: () =>
    invoke({
      type: "read_settings",
      requestId: crypto.randomUUID(),
    }),
  restartRuntime: () =>
    invoke({
      type: "restart_runtime",
      requestId: crypto.randomUUID(),
    }),
  onAgentEvent(listener) {
    return subscribe((message) => {
      if (message.type === "agent_event") listener(message.event);
    });
  },
  onRuntimeStatus(listener) {
    return subscribe((message) => {
      if (message.type === "runtime_status") listener(message.status);
    });
  },
};

function subscribe(listener: (message: RuntimeMessage) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
    const parsed = runtimeMessageSchema.safeParse(raw);
    if (parsed.success) listener(parsed.data);
  };
  ipcRenderer.on(DESKTOP_IPC.event, handler);
  return () => ipcRenderer.removeListener(DESKTOP_IPC.event, handler);
}

contextBridge.exposeInMainWorld("codemap", api);
