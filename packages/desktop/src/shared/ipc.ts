import { z } from "zod";
import {
  agentSessionCommandSchema,
  agentSessionEventSchema,
  type AgentSessionCommand,
  type AgentSessionEvent,
  type ThreadSummary,
} from "@codemap-ai/core/agent/contracts";

const requestIdSchema = z.string().min(1);

const workingDiffFileSchema = z
  .object({
    path: z.string(),
    oldPath: z.string().optional(),
    status: z.enum(["added", "modified", "deleted", "renamed"]),
    original: z.string(),
    modified: z.string(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  })
  .strict();

export const desktopCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("select_workspace"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("open_workspace"),
      requestId: requestIdSchema,
      workspacePath: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("agent"),
      command: agentSessionCommandSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("read_settings"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("restart_runtime"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("get_working_diff"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("get_working_diff_files"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("get_branch_name"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("get_mcp_status"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("get_tools_list"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("read_file_preview"),
      requestId: requestIdSchema,
      filePath: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("run_slash_command"),
      requestId: requestIdSchema,
      name: z.string().min(1),
      args: z.string().default(""),
    })
    .strict(),
  z
    .object({
      type: z.literal("get_account_info"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("account_login"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("account_logout"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("list_projects"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("link_project"),
      requestId: requestIdSchema,
      projectId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("open_url"),
      requestId: requestIdSchema,
      url: z.string().url(),
    })
    .strict(),
  z
    .object({
      type: z.literal("get_auto_index_status"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("enable_auto_indexing"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("disable_auto_indexing"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("get_graph_data"),
      requestId: requestIdSchema,
    })
    .strict(),
]);

export const utilityCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("initialize"),
      requestId: requestIdSchema,
      workspacePath: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("agent"),
      command: agentSessionCommandSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("read_settings"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("get_mcp_status"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("get_tools_list"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("read_file_preview"),
      requestId: requestIdSchema,
      filePath: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("run_slash_command"),
      requestId: requestIdSchema,
      name: z.string().min(1),
      args: z.string().default(""),
    })
    .strict(),
  z
    .object({
      type: z.literal("get_account_info"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("account_login"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("account_logout"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("list_projects"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("link_project"),
      requestId: requestIdSchema,
      projectId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("get_auto_index_status"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("enable_auto_indexing"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("disable_auto_indexing"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("get_graph_data"),
      requestId: requestIdSchema,
    })
    .strict(),
]);

export interface ModelInfo {
  id: string;
  object?: string;
  ownedBy?: string;
}

const modelInfoSchema = z.object({
  id: z.string(),
  object: z.string().optional(),
  ownedBy: z.string().optional(),
}).strict();

const settingsMetadataSchema = z
  .object({
    provider: z.string(),
    baseUrl: z.string(),
    defaultModel: z.string(),
    availableModels: z.array(modelInfoSchema),
    hasApiKey: z.boolean(),
    hasApiToken: z.boolean(),
  })
  .strict();

export const runtimeMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ready"),
      workspacePath: z.string(),
      settings: settingsMetadataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("agent_event"),
      event: agentSessionEventSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("request_result"),
      requestId: requestIdSchema,
      result: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("request_error"),
      requestId: requestIdSchema,
      message: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("runtime_status"),
      status: z.enum(["starting", "ready", "disconnected"]),
      message: z.string().optional(),
    })
    .strict(),
]);

export type DesktopCommand = z.infer<typeof desktopCommandSchema>;
export type RuntimeMessage = z.infer<typeof runtimeMessageSchema>;
export type UtilityCommand = z.infer<typeof utilityCommandSchema>;
export type WorkingDiffFile = z.infer<typeof workingDiffFileSchema>;

export interface SettingsMetadataInput {
  provider?: string;
  baseUrl?: string;
  defaultModel?: string;
  availableModels?: ModelInfo[];
  apiKey?: string;
  apiToken?: string;
}

export interface SettingsMetadata {
  provider: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: ModelInfo[];
  hasApiKey: boolean;
  hasApiToken: boolean;
}

export function redactSettingsMetadata(
  settings: SettingsMetadataInput,
): SettingsMetadata {
  const fallbackModel = settings.defaultModel ?? "coder";
  return {
    provider: settings.provider ?? "9router",
    baseUrl: settings.baseUrl ?? "http://localhost:4000/v1",
    defaultModel: fallbackModel,
    availableModels: settings.availableModels ?? [
      { id: fallbackModel },
    ],
    hasApiKey: Boolean(settings.apiKey),
    hasApiToken: Boolean(settings.apiToken),
  };
}

export interface ReadFilePreviewResult {
  content: string;
  language: string;
  lines: number;
  truncated: boolean;
}

export interface McpServerStatus {
  name: string;
  connected: boolean;
  connecting?: boolean;
  toolCount: number;
  toolNames: string[];
  toolDetails: { name: string; description: string }[];
  transport: "stdio" | "http";
  error?: string;
}

export interface McpSkippedServer {
  name: string;
  reason: string;
}

export interface McpStatusResult {
  hasServers: boolean;
  statuses: McpServerStatus[];
  skipped: McpSkippedServer[];
}

export interface ToolInfo {
  name: string;
  description?: string;
}

export interface ToolsListResult {
  tools: ToolInfo[];
  groupedByServer: Record<string, ToolInfo[]>;
}

export interface SlashCommandResult {
  output: string;
  action?: "clear" | "plan" | "build" | "mcp";
}

export interface AccountUser {
  email?: string;
  name?: string;
}

export interface AccountInfo {
  loggedIn: boolean;
  user?: AccountUser;
  apiUrl?: string;
}

export interface CloudProject {
  id: string;
  name: string;
  status: string;
  repoUrl?: string;
}

export interface AccountLoginResult {
  success: boolean;
  user?: AccountUser;
  error?: string;
  authorizeUrl?: string;
}

export interface ListProjectsResult {
  projects: CloudProject[];
  error?: string;
}

export interface LinkProjectResult {
  success: boolean;
  projectName?: string;
  error?: string;
}

export interface AutoIndexStatusResult {
  isActive: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  path: string;
  inboundCount: number;
  outboundCount: number;
  category: "entry" | "core" | "shared" | "other";
}

export interface GraphData {
  nodes: GraphNode[];
  edges: Array<[string, string]>;
  timestamp: number;
  error?: string;
}

export interface DesktopApi {
  openWorkspace(): Promise<string | null>;
  openWorkspacePath(workspacePath: string): Promise<string>;
  send(content: string, options?: {
    model?: string;
    mode?: "build" | "plan" | "fast";
    images?: Array<{ data: string; mimeType: string; filename?: string }>;
  }): Promise<void>;
  abort(): Promise<void>;
  listThreads(): Promise<ThreadSummary[]>;
  switchThread(threadId: string): Promise<void>;
  newThread(): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  respondToApproval(
    approvalId: string,
    decision: "approve" | "decline" | "always_allow_category",
  ): Promise<void>;
  respondToQuestion(
    questionId: string,
    answer: string | string[],
  ): Promise<void>;
  respondToPlanReview(
    planReviewId: string,
    action: "apply" | "reject" | "revise",
    feedback?: string,
  ): Promise<void>;
  readSettings(): Promise<SettingsMetadata>;
  restartRuntime(): Promise<void>;
  getWorkingDiff(): Promise<string>;
  getWorkingDiffFiles(): Promise<WorkingDiffFile[]>;
  getBranchName(): Promise<string>;
  getMcpStatus(): Promise<McpStatusResult | null>;
  getToolsList(): Promise<ToolsListResult | null>;
  readFilePreview(filePath: string): Promise<ReadFilePreviewResult | null>;
  runSlashCommand(name: string, args: string): Promise<SlashCommandResult>;
  getAccountInfo(): Promise<AccountInfo | null>;
  accountLogin(): Promise<AccountLoginResult | null>;
  accountLogout(): Promise<{ success: boolean; error?: string } | null>;
  listProjects(): Promise<ListProjectsResult | null>;
  linkProject(projectId: string): Promise<LinkProjectResult | null>;
  openUrl(url: string): Promise<void>;
  getAutoIndexStatus(): Promise<AutoIndexStatusResult | null>;
  enableAutoIndexing(): Promise<{ success: boolean; error?: string } | null>;
  disableAutoIndexing(): Promise<{ success: boolean; error?: string } | null>;
  getGraphData(): Promise<GraphData | null>;
  onAgentEvent(listener: (event: AgentSessionEvent) => void): () => void;
  onRuntimeStatus(
    listener: (status: "starting" | "ready" | "disconnected") => void,
  ): () => void;
}

export type { AgentSessionCommand, AgentSessionEvent };

export const DESKTOP_IPC = {
  command: "codemap:command",
  event: "codemap:event",
} as const;
