import type { GatewayModel } from "@codemap-ai/core/agent";
import type { UIState } from "./types.js";

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
    mode: "build",
    planReview: { active: false, selection: 0, reviseMode: false },
    planContent: null,
    askQuestion: null,
    toolApproval: null,
    debug: opts.debug ?? false,
    debugLogFile: null,
    previewDiffExpanded: false,
  };
}
