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
  openWorkspacePath: (workspacePath) =>
    invoke({
      type: "open_workspace",
      requestId: crypto.randomUUID(),
      workspacePath,
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
  openUrl: (url) =>
    invoke({
      type: "open_url",
      requestId: crypto.randomUUID(),
      url,
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
