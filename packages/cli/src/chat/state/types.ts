import type { TaskPhase, UsageStats } from "@codemap-ai/core/agent";
import type { GatewayModel } from "@codemap-ai/core/agent";
import type { TaskItemSnapshot, HarnessDisplayState } from "@codemap-ai/runtime-node";

/** @deprecated Use TaskItemSnapshot from @mastra/core/harness directly */
export type TaskListItem = TaskItemSnapshot;

export interface ToolResult {
  name: string;
  content: string;
  fullContent?: string;
  success: boolean;
}

export interface ChangedFileSummary {
  path: string;
  kind: "new" | "edited" | "deleted" | "renamed";
  previousPath?: string;
  additions: number;
  deletions: number;
}

export interface ChangedSummary {
  files: ChangedFileSummary[];
  newCount: number;
  editedCount: number;
  deletedCount: number;
  renamedCount: number;
}

export interface Message {
  role: "user" | "assistant" | "tool_call" | "system" | "welcome";
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  toolResults?: ToolResult[];
  expanded?: boolean;
  expandedContent?: string;
  expandedResultIndex?: number;
  previewContent?: string;
  welcomeData?: WelcomeData;
  timestamp?: number;
  startedAtMs?: number;
}

export interface WelcomeData {
  model: string;
  modelCount?: number;
}

export type Screen = "main" | "help";

export type ChatMode =
  | "auto"
  | "find_files"
  | "explain_code"
  | "plan_change"
  | "edit_code"
  | "review_diff"
  | "debug_issue";

export interface ChatWorkspaceState {
  projectId?: string;
  projectName?: string;
  repoName?: string;
  branch?: string;
  commitSha?: string;
  indexStatus:
    | "fresh"
    | "stale"
    | "indexing"
    | "failed"
    | "missing"
    | "unknown";
  indexUpdatedAt?: string;
  isIndexStale: boolean;
  hasLocalChanges: boolean;
  changedFilesCount: number;
  authMode: "local" | "cloud" | "unauthenticated";
  includeDiff: boolean;
  activeContextSummary?: string;
}

export interface ChatContextItem {
  id: string;
  type: "file" | "symbol" | "search" | "diff" | "tool_call" | "assumption";
  label: string;
  source: "user" | "tool" | "system";
  pinned: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ChatContextState {
  files: ChatContextItem[];
  symbols: ChatContextItem[];
  searches: ChatContextItem[];
  diffs: ChatContextItem[];
  toolCalls: ChatContextItem[];
  assumptions: ChatContextItem[];
}

export interface UIState {
  screen: Screen;
  messages: Message[];
  taskList: TaskListItem[];
  taskListVisible: boolean;
  task: {
    phase: TaskPhase;
    model?: string;
    effort?: "low" | "medium" | "high";
    toolName?: string;
    toolArgs?: string;
    startTime?: number;
    endTime?: number;
    toolsCalled: number;
    usage?: UsageStats;
  };
  sessionTokens: number;
  streaming: {
    active: boolean;
    content: string;
    entryIndex: number;
  };
  input: {
    busy: boolean;
    history: string[];
    lastUserText: string | null;
  };
  subprocess: {
    active: boolean;
    command: string;
    logLines: string[];
  };
  config: {
    model: string;
    debug: boolean;
    availableModels: GatewayModel[];
  };
  changedSummary: ChangedSummary | null;
  workspace?: {
    repoName: string;
    branch: string;
    localCommit?: string;
    cloudCommit?: string;
  };
  chatMode: ChatMode;
  workspaceState: ChatWorkspaceState;
  contextState: ChatContextState;
  synthRunning: boolean;
  planMode: boolean;
  planReview: { active: boolean; selection: number; reviseMode?: boolean };
  planContent: string | null;
  askQuestion:
    | (HarnessDisplayState["pendingQuestion"] & {
        selection: number;
        selected: number[];
      })
    | null;
  toolApproval:
    | (HarnessDisplayState["pendingApproval"] & {
        selection: number;
      })
    | null;
  debug: boolean;
  debugLogFile: string | null;
  previewDiffExpanded: boolean;
}
