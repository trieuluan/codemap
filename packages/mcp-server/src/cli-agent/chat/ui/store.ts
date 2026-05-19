import type { EventBus, TaskPhase, UsageStats } from "./event-bus.js";

// ─── Message Types ───────────────────────────────────────

export interface Message {
  role: "user" | "assistant" | "tool" | "system" | "welcome";
  content: string;
  toolName?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  toolResults?: Array<{ name: string; content: string; success: boolean }>;
  expanded?: boolean;
  expandedResultIndex?: number;
  welcomeData?: WelcomeData;
  timestamp?: number;
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

  // Active task
  task: {
    phase: TaskPhase;
    model?: string;
    toolName?: string;
    toolArgs?: string;
    startTime?: number;
    endTime?: number;
    toolsCalled: number;
    usage?: UsageStats;
  };

  // Accumulated token usage for the current chat session.
  sessionUsage: UsageStats;

  // Streaming buffer
  streaming: {
    active: boolean;
    content: string;
    entryIndex: number; // index into messages[]
  };

  // Confirm dialog
  confirm: {
    active: boolean;
    toolName: string;
    preview: string | null;
  };

  // Input
  input: {
    busy: boolean;
    history: string[];
    lastUserText: string | null;
    autoAccept: boolean;
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
    profile: string;
    debug: boolean;
    availableModels: string[];
  };

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

  // Agent history (ChatMessage[] sent to provider)
  agentHistory: Array<{ role: string; content: string; toolCalls?: unknown[] }>;

  // Background synthesis status
  synthRunning: boolean;

  // Plan mode: when on, all messages go through multi-phase (planner→coder→reviewer)
  planMode: boolean;

  // Plan review: paused after planner finishes, waiting for user to approve/revise/cancel
  planReview: { active: boolean; selection: number };

  // Context compaction status
  compaction: {
    usagePercent: number;
    compactedCount: number;
    lastStrategy?: string;
  };

  // Debug
  debug: boolean;
  debugLogFile: string | null;
}

// ─── Initial State ───────────────────────────────────────

export function createInitialState(opts: {
  model: string;
  profile: string;
  availableModels?: string[];
  debug?: boolean;
}): UIState {
  return {
    screen: "main",
    messages: [],
    task: {
      phase: "idle",
      toolsCalled: 0,
    },
    sessionUsage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    streaming: {
      active: false,
      content: "",
      entryIndex: -1,
    },
    confirm: {
      active: false,
      toolName: "",
      preview: null,
    },
    input: {
      busy: false,
      history: [],
      lastUserText: null,
      autoAccept: false,
    },
    subprocess: {
      active: false,
      command: "",
      logLines: [],
    },
    config: {
      model: opts.model,
      profile: opts.profile,
      debug: opts.debug ?? false,
      availableModels: opts.availableModels ?? [],
    },
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
    agentHistory: [],
    synthRunning: false,
    planMode: false,
    planReview: { active: false, selection: 0 },
    compaction: { usagePercent: 0, compactedCount: 0 },
    debug: opts.debug ?? false,
    debugLogFile: null,
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
    if (
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
