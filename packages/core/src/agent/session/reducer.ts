import type {
  AgentSessionEvent,
  SessionSnapshot,
} from "../contracts/index.ts";

const EMPTY_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

export function createInitialSessionSnapshot(
  input: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    threadId: null,
    messages: [],
    status: "idle",
    streamingText: "",
    thinkingText: "",
    tools: [],
    pendingApproval: null,
    pendingQuestion: null,
    usage: EMPTY_USAGE,
    threadUsage: null,
    model: null,
    error: null,
    ...input,
  };
}

export function reduceAgentSessionEvent(
  state: SessionSnapshot,
  event: AgentSessionEvent,
): SessionSnapshot {
  switch (event.type) {
    case "snapshot":
      return event.snapshot;
    case "status":
      return {
        ...state,
        status: event.status,
        error: event.status === "error" ? state.error : null,
      };
    case "token":
      return { ...state, streamingText: state.streamingText + event.text };
    case "thinking":
      return { ...state, thinkingText: state.thinkingText + event.text };
    case "model":
      return { ...state, model: event.model };
    case "tool_start":
      return {
        ...state,
        tools: [
          ...state.tools,
          {
            toolCallId: event.toolCallId,
            name: event.name,
            args: event.args,
            preview: event.preview,
          },
        ],
      };
    case "tool_result":
      return {
        ...state,
        tools: state.tools.map((tool) =>
          tool.toolCallId === event.toolCallId
            ? { ...tool, result: event.result, isError: event.isError }
            : tool,
        ),
      };
    case "approval":
      return { ...state, pendingApproval: event.approval };
    case "approval_resolved":
      return state.pendingApproval?.approvalId === event.approvalId
        ? { ...state, pendingApproval: null }
        : state;
    case "question":
      return { ...state, pendingQuestion: event.question };
    case "question_resolved":
      return state.pendingQuestion?.questionId === event.questionId
        ? { ...state, pendingQuestion: null }
        : state;
    case "usage":
      return { ...state, usage: event.usage };
    case "thread_change":
      return {
        ...createInitialSessionSnapshot(),
        threadId: event.threadId,
        messages: event.messages,
        model: state.model,
        threadUsage: event.tokenUsage ?? null,
        systemPrompt: event.systemPrompt,
      };
    case "error":
      return { ...state, status: "error", error: event.message };
  }
}
