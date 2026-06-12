import type { EventBus, TaskPhase, UsageStats } from "../events/event-bus.js";
import type { TaskItemSnapshot, HarnessDisplayState } from "@mastra/core/harness";
import type { GatewayModel } from "../../agent/types.js";

/** @deprecated Use TaskItemSnapshot from @mastra/core/harness directly */
export type TaskListItem = TaskItemSnapshot;

// ─── Message Types ───────────────────────────────────────

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
  name?: string; // for tool_call role
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  toolResults?: ToolResult[];
  expanded?: boolean;
  expandedContent?: string;
  expandedResultIndex?: number;
  previewContent?: string; // passive tool preview shown inline
  welcomeData?: WelcomeData;
  timestamp?: number;
  /** Actual wall-clock time the tool started (not grouped by HarnessMessage.createdAt). */
  startedAtMs?: number;
}

export interface WelcomeData {
  model: string;
  modelCount?: number;
}

// ─── UI State ────────────────────────────────────────────

export type Screen = "main" | "help";

export type ChatMode = "auto" | "find_files" | "explain_code" | "plan_change" | "edit_code" | "review_diff" | "debug_issue";

export interface ChatWorkspaceState {
  projectId?: string;
  projectName?: string;
  repoName?: string;
  branch?: string;
  commitSha?: string;
  indexStatus: "fresh" | "stale" | "indexing" | "failed" | "missing" | "unknown";
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
  // Current screen
  screen: Screen;

  // Messages
  messages: Message[];

  // Global task list (from task_write/task_update/task_complete tool calls)
  taskList: TaskListItem[];
  taskListVisible: boolean;

  // Active task
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

  // Total tokens consumed in the current thread (synced from Mastra thread storage).
  sessionTokens: number;

  // Streaming buffer
  streaming: {
    active: boolean;
    content: string;
    entryIndex: number; // index into messages[]
  };

  // Input
  input: {
    busy: boolean;
    history: string[];
    lastUserText: string | null;
  };

  // Subprocess
  subprocess: {
    active: boolean;
    command: string;
    logLines: string[];
  };

  // Session config
  config: {
    model: string;
    debug: boolean;
    availableModels: GatewayModel[];
  };

  changedSummary: ChangedSummary | null;

  // Git workspace info — populated async after start
  workspace?: {
    repoName: string;
    branch: string;
    localCommit?: string;
    cloudCommit?: string;
  };

  chatMode: ChatMode;
  workspaceState: ChatWorkspaceState;
  contextState: ChatContextState;

  // Background synthesis status
  synthRunning: boolean;

  // Plan mode: when on, all messages go through multi-phase (planner→coder→reviewer)
  planMode: boolean;

  // Plan review: paused after planner finishes, waiting for user to approve/revise/cancel
  planReview: { active: boolean; selection: number; reviseMode?: boolean };

  // Plan content: raw markdown from the planner, stored for structured rendering
  planContent: string | null;

  // ask_user: AI is waiting for user to answer an inline question
  askQuestion: HarnessDisplayState["pendingQuestion"] & {
    selection: number;
    selected: number[]; // indices of toggled options in multi-select
  } | null;

  // Tool approval: harness is waiting for user to approve/decline a tool call
  toolApproval: HarnessDisplayState["pendingApproval"] & {
    selection: number; // 0=approve, 1=decline, 2=always_allow
  } | null;

  // Debug
  debug: boolean;
  debugLogFile: string | null;

  // When true, diff previews are not truncated (toggled via Ctrl+E)
  previewDiffExpanded: boolean;
}

// ─── Initial State ───────────────────────────────────────

export function createInitialState(opts: {
  model: string;
  availableModels?: GatewayModel[];
  debug?: boolean;
}): UIState {
  return {
    screen: "main",
    messages: [],
    taskList: [],
    taskListVisible: true,
    task: {
      phase: "idle",
      toolsCalled: 0,
    },
    sessionTokens: 0,
    streaming: {
      active: false,
      content: "",
      entryIndex: -1,
    },
    input: {
      busy: false,
      history: [],
      lastUserText: null,
    },
    subprocess: {
      active: false,
      command: "",
      logLines: [],
    },
    config: {
      model: opts.model,
      debug: opts.debug ?? false,
      availableModels: opts.availableModels ?? [],
    },
    changedSummary: null,
    chatMode: "auto",
    workspaceState: {
      indexStatus: "unknown",
      isIndexStale: false,
      hasLocalChanges: false,
      changedFilesCount: 0,
      authMode: "local",
      includeDiff: false,
    },
    contextState: {
      files: [],
      symbols: [],
      searches: [],
      diffs: [],
      toolCalls: [],
      assumptions: [],
    },
    synthRunning: false,
    planMode: false,
    planReview: { active: false, selection: 0, reviseMode: false },
    planContent: null,
    askQuestion: null,
    toolApproval: null,
    debug: opts.debug ?? false,
    debugLogFile: null,
    previewDiffExpanded: false,
  };
}

// ─── Store ───────────────────────────────────────────────

type StateUpdater = (prev: UIState) => Partial<UIState>;

export class Store {
  private state: UIState;
  private dirty = false;
  private bus: EventBus;

  constructor(initialState: UIState, bus: EventBus) {
    this.state = initialState;
    this.bus = bus;
  }

  getState(): Readonly<UIState> {
    return this.state;
  }

  /**
   * Merge a partial state update. Schedules a single screen:refresh
   * on the next microtask, coalescing multiple dispatches in the same tick.
   */
  dispatch(partial: Partial<UIState> | StateUpdater): void {
    if (typeof partial === "function") {
      partial = partial(this.state);
    }
    this.state = deepMerge(this.state, partial);
    if (!this.dirty) {
      this.dirty = true;
      queueMicrotask(() => {
        this.dirty = false;
        this.bus.emit({ type: "screen:refresh" });
      });
    }
  }

  /** Immediate dispatch — used for streaming tokens that need instant redraw. */
  dispatchImmediate(partial: Partial<UIState>): void {
    this.state = deepMerge(this.state, partial);
    this.bus.emit({ type: "screen:refresh" });
  }
}

// ─── Deep Merge ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target } as any;
  for (const key of Object.keys(source) as Array<keyof T>) {
    const srcVal = (source as any)[key];
    const tgtVal = (target as any)[key];
    if (srcVal instanceof Set || srcVal instanceof Map) {
      // Sets and Maps are opaque — replace entirely rather than merging
      result[key] = srcVal;
    } else if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }
  return result as T;
}
