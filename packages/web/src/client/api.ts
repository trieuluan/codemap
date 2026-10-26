import { createInitialSessionSnapshot, reduceAgentSessionEvent } from "@codemap-ai/core/agent/session";
import type { AgentSessionEvent, CodeMapApi, WebBootstrap, IndexStatus } from "../shared/ipc.js";
import { runtimeMessageSchema } from "../shared/ipc.js";

export interface EventStream {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}
interface WebTransport {
  fetch(url: string, init?: RequestInit): Promise<Response>;
  eventSource(url: string): EventStream;
  openUrl(url: string): void;
}

export function createWebApi(transport: WebTransport): CodeMapApi {
  let snapshot = createInitialSessionSnapshot();
  let status: WebBootstrap["status"] = "starting";
  let index: IndexStatus | undefined;
  let stream: EventStream | null = null;
  const agentListeners = new Set<(event: AgentSessionEvent) => void>();
  const statusListeners = new Set<(value: WebBootstrap["status"]) => void>();
  const indexListeners = new Set<(value: IndexStatus) => void>();
  function connect() {
    if (stream) return;
    stream = transport.eventSource("/api/events");
    stream.onmessage = ({ data }) => {
      let raw: unknown;
      try { raw = JSON.parse(data); } catch { return; }
      const parsed = runtimeMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.type === "agent_event") {
        snapshot = reduceAgentSessionEvent(snapshot, message.event);
        for (const listener of agentListeners) listener(message.event);
      } else if (message.type === "runtime_status") {
        status = message.status;
        for (const listener of statusListeners) listener(status);
      } else if (message.type === "index_status") {
        index = message.index;
        for (const listener of indexListeners) listener(index);
      }
    };
    stream.onerror = () => {
      status = "disconnected";
      for (const listener of statusListeners) listener(status);
    };
  }
  async function invoke<T>(command: unknown): Promise<T> {
    const response = await transport.fetch("/api/command", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
    });
    const data = await response.json() as { result: T; error?: string };
    if (!response.ok || data.error) throw new Error(data.error ?? `Request failed (${response.status})`);
    return data.result;
  }
const api: CodeMapApi = {
  bootstrap: async () => {
    const response = await transport.fetch("/api/bootstrap", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Cannot connect to CodeMap server");
    const data = await response.json() as WebBootstrap;
    snapshot = data.snapshot;
    status = data.status;
    if (data.index) index = data.index;
    connect();
    return data;
  },
  retryIndex: () => invoke({ type: "retry_index", requestId: crypto.randomUUID() }),
  send: (content, options = {}) => {
    const requestId = crypto.randomUUID();
    return invoke<void>({
      type: "agent",
      command: {
        type: "send",
        requestId,
        input: { content, ...options },
      },
    }).catch(cause => {
      const event: AgentSessionEvent = { type: "error", requestId, message: cause instanceof Error ? cause.message : String(cause) };
      snapshot = reduceAgentSessionEvent(snapshot, event);
      for (const listener of agentListeners) listener(event);
      throw cause;
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
  respondToPlanReview: (planReviewId, action, feedback) => {
    const requestId = crypto.randomUUID();
    return invoke({
      type: "agent",
      command: {
        type: "respond_plan_review",
        requestId,
        response: { requestId, planReviewId, action, feedback },
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
  getWorkingDiff: () =>
    invoke({
      type: "get_working_diff",
      requestId: crypto.randomUUID(),
    }),
  getWorkingDiffFiles: () =>
    invoke({
      type: "get_working_diff_files",
      requestId: crypto.randomUUID(),
    }),
  getBranchName: () =>
    invoke({
      type: "get_branch_name",
      requestId: crypto.randomUUID(),
    }),
  getMcpStatus: () =>
    invoke({
      type: "get_mcp_status",
      requestId: crypto.randomUUID(),
    }),
  getToolsList: () =>
    invoke({
      type: "get_tools_list",
      requestId: crypto.randomUUID(),
    }),
  readFilePreview: (filePath) =>
    invoke({
      type: "read_file_preview",
      requestId: crypto.randomUUID(),
      filePath,
    }),
  readFile: (filePath) =>
    invoke({
      type: "read_file",
      requestId: crypto.randomUUID(),
      filePath,
    }),
  writeFile: (filePath, content) =>
    invoke({
      type: "write_file",
      requestId: crypto.randomUUID(),
      filePath,
      content,
    }),
  statFile: (filePath) =>
    invoke({
      type: "stat_file",
      requestId: crypto.randomUUID(),
      filePath,
    }),
  readDirectory: (dirPath) =>
    invoke({
      type: "read_directory",
      requestId: crypto.randomUUID(),
      dirPath,
    }),
  listDirectory: (dirPath) =>
    invoke({
      type: "list_directory",
      requestId: crypto.randomUUID(),
      dirPath,
    }),
  runSlashCommand: (name, args) =>
    invoke({
      type: "run_slash_command",
      requestId: crypto.randomUUID(),
      name,
      args,
    }),
  getAccountInfo: () =>
    invoke({
      type: "get_account_info",
      requestId: crypto.randomUUID(),
    }),
  accountLogin: () =>
    invoke({
      type: "account_login",
      requestId: crypto.randomUUID(),
    }),
  accountLogout: () =>
    invoke({
      type: "account_logout",
      requestId: crypto.randomUUID(),
    }),
  listProjects: () =>
    invoke({
      type: "list_projects",
      requestId: crypto.randomUUID(),
    }),
  linkProject: (projectId) =>
    invoke({
      type: "link_project",
      requestId: crypto.randomUUID(),
      projectId,
    }),
  getAutoIndexStatus: () =>
    invoke({
      type: "get_auto_index_status",
      requestId: crypto.randomUUID(),
    }),
  enableAutoIndexing: () =>
    invoke({
      type: "enable_auto_indexing",
      requestId: crypto.randomUUID(),
    }),
  disableAutoIndexing: () =>
    invoke({
      type: "disable_auto_indexing",
      requestId: crypto.randomUUID(),
    }),
  getGraphData: () =>
    invoke({
      type: "get_graph_data",
      requestId: crypto.randomUUID(),
    }),
  openUrl: async (url) => {
    const target = new URL(url);
    if (!["https:", "http:"].includes(target.protocol)) throw new Error("Only HTTP URLs are supported");
    transport.openUrl(target.href);
  },
  onAgentEvent(listener) {
    agentListeners.add(listener);
    listener({ type: "snapshot", snapshot });
    return () => { agentListeners.delete(listener); };
  },
  onRuntimeStatus(listener) {
    statusListeners.add(listener);
    listener(status);
    return () => { statusListeners.delete(listener); };
  },
  onIndexStatus(listener) {
    indexListeners.add(listener);
    if (index) listener(index);
    return () => { indexListeners.delete(listener); };
  },
};
return api;
}
