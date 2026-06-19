import { useState } from "react";
import {
  Check,
  CircleHelp,
  Copy,
  FileCode2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type { SessionSnapshot } from "@codemap-ai/core/agent/contracts";
import type { ConversationItem, LocalMessage } from "../hooks/useAgentSession.js";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "./ai-elements/conversation.js";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageAttachments,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from "./ai-elements/message.js";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "./ai-elements/reasoning.js";
import { Shimmer } from "./ai-elements/shimmer.js";
import { ToolExecution } from "./ToolExecution.js";

const reasoningThinkingMessage = (streaming: boolean, duration?: number) =>
  streaming
    ? <Shimmer as="span" duration={1}>Reasoning...</Shimmer>
    : `Reasoned for ${duration ?? "a few"} seconds`;

interface ConversationPanelProps {
  displayItems: ConversationItem[];
  snapshot: SessionSnapshot;
  error: string | null;
  isBusy: boolean;
  loadingMessages?: boolean;
  workspaceRoot?: string | null;
  onApprove: (approvalId: string) => void;
  onDecline: (approvalId: string) => void;
  onAnswerQuestion: (questionId: string, answer: string) => void;
  onSubmitPrompt: (content: string) => void;
}

const suggestions = [
  "Explain the workspace runtime",
  "Find the IPC entrypoints",
  "Add a request tracker",
];

function isUserMessageItem(
  item: ConversationItem,
): item is Extract<ConversationItem, { kind: "message" }> {
  return item.kind === "message" && item.message.role === "user";
}

export function ConversationPanel({
  displayItems,
  snapshot,
  error,
  isBusy,
  loadingMessages = false,
  workspaceRoot,
  onApprove,
  onDecline,
  onAnswerQuestion,
  onSubmitPrompt,
}: ConversationPanelProps) {
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | undefined>(undefined);
  const latestAssistantIndex = displayItems.findLastIndex(
    (item) => item.kind === "message" && item.message.role === "assistant",
  );

  function messageId(message: LocalMessage) {
    return message.localId;
  }

  async function copyMessage(message: LocalMessage) {
    await navigator.clipboard.writeText(message.content);
    const id = messageId(message);
    setCopiedMessageId(id);
    window.setTimeout(() => setCopiedMessageId(undefined), 1600);
  }

  return (
    <Conversation key={snapshot.threadId ?? "empty"} className="conversation">
      <ConversationContent className="conversation-content">
        {displayItems.length === 0 ? (
          loadingMessages ? (
            <div className="empty-chat">
              <ConversationEmptyState
                icon={
                  <span className="grid w-13 h-13 place-items-center border border-border rounded-[14px] bg-card">
                    <Loader2 size={25} className="animate-spin" />
                  </span>
                }
                title="Loading conversation..."
                description="Fetching messages for this thread"
              />
            </div>
          ) : (
            <div className="empty-chat">
              <ConversationEmptyState
                icon={
                  <span className="grid w-13 h-13 place-items-center border border-border rounded-[14px] bg-card">
                    <FileCode2 size={25} />
                  </span>
                }
                title="What are we building?"
                description="Mention files with @path/to/file, attach images, or ask CodeMap to inspect and modify this workspace."
              />
              <div className="empty-suggestions" aria-label="Suggested prompts">
                {suggestions.map((suggestion) => (
                  <button
                    className="suggestion-chip"
                    disabled={isBusy}
                    key={suggestion}
                    onClick={() => onSubmitPrompt(suggestion)}
                    type="button"
                  >
                    <Sparkles size={13} />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="message-stack">
          {displayItems.map((item, index) => {
            if (item.kind === "tool") {
              const tool = item.tool;
              return (
                <section className="tool-stack" key={`tool-${tool.toolCallId}-${index}`}>
                  <ToolExecution
                    toolCallId={tool.toolCallId}
                    name={tool.name}
                    args={tool.args}
                    preview={tool.preview}
                    result={tool.result}
                    isError={tool.isError}
                    workspaceRoot={workspaceRoot}
                  />
                </section>
              );
            }

            if (item.kind === "reasoning") {
              const reasoning = item.reasoning;
              return (
                <div className="turn-activity thinking-row" key={`reasoning-${reasoning.localId}-${index}`}>
                  <Reasoning
                    className="codemap-reasoning"
                    defaultOpen={reasoning.isStreaming || !!reasoning.content}
                    isStreaming={reasoning.isStreaming}
                  >
                    <ReasoningTrigger
                      getThinkingMessage={reasoningThinkingMessage}
                    />
                    {reasoning.content && (
                      <ReasoningContent className="codemap-reasoning-content">
                        {reasoning.content}
                      </ReasoningContent>
                    )}
                  </Reasoning>
                </div>
              );
            }

            const message = item.message;
            const id = messageId(message);
            const previousUserMessage = displayItems
              .slice(0, index)
              .findLast(isUserMessageItem)?.message;
            const isLatestAssistant =
              message.role === "assistant" && index === latestAssistantIndex;

            const isUser = message.role === "user";

            return (
              <article
                className={`message-row ${isUser ? "message-row-user" : ""}`}
                data-role={message.role}
                key={`message-${id}-${index}`}
              >
                <div className={`message-shell ${isUser ? "message-shell-user" : ""}`}>
                  <Message
                    className="codemap-message"
                    from={isUser ? "user" : "assistant"}
                  >
                    <MessageContent className="codemap-message-content message-body">
                      {isUser && message.images && message.images.length > 0 && (
                        <MessageAttachments
                          files={message.images.map((img, i) => ({
                            type: "file" as const,
                            url: `data:${img.mimeType};base64,${img.data}`,
                            mediaType: img.mimeType,
                            filename: img.filename,
                            id: String(i),
                          }))}
                        />
                      )}
                      <MessageResponse isStreaming={isBusy && isLatestAssistant && !isUser}>{message.content}</MessageResponse>
                    </MessageContent>
                  </Message>
                  {isLatestAssistant && message.content && !isBusy && (
                    <MessageToolbar className="message-toolbar">
                      <MessageActions className="message-actions">
                        <MessageAction
                          label="Copy response"
                          onClick={() => void copyMessage(message)}
                          tooltip={copiedMessageId === id ? "Copied" : "Copy"}
                        >
                          {copiedMessageId === id ? <Check size={14} /> : <Copy size={14} />}
                        </MessageAction>
                        <MessageAction
                          disabled={!previousUserMessage}
                          label="Retry response"
                          onClick={() => {
                            if (previousUserMessage) onSubmitPrompt(previousUserMessage.content);
                          }}
                          tooltip="Retry"
                        >
                          <RefreshCw size={14} />
                        </MessageAction>
                      </MessageActions>
                    </MessageToolbar>
                  )}
                </div>
              </article>
            );
          })}
          </div>
        )}

        {snapshot.pendingApproval && snapshot.pendingApproval.toolName !== "submit_plan" && (
        <section className="prompt-card approval-card">
          <div className="prompt-card-header">
            <ShieldCheck size={16} />
            <strong>Allow {snapshot.pendingApproval.toolName}?</strong>
          </div>
          <p className="muted">
            The agent is requesting permission before it runs this tool.
          </p>
          <pre>{JSON.stringify(snapshot.pendingApproval.args, null, 2)}</pre>
          <div className="prompt-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => onApprove(snapshot.pendingApproval!.approvalId)}
            >
              Approve
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onDecline(snapshot.pendingApproval!.approvalId)}
            >
              Decline
            </button>
          </div>
        </section>
        )}

        {snapshot.pendingQuestion && (
        <section className="prompt-card question-card">
          <div className="prompt-card-header">
            <CircleHelp size={16} />
            <strong>{snapshot.pendingQuestion.question}</strong>
          </div>
          {snapshot.pendingQuestion.options?.length ? (
            <div className="prompt-actions">
              {snapshot.pendingQuestion.options.map((option) => (
                <button
                  key={option.label}
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    onAnswerQuestion(
                      snapshot.pendingQuestion!.questionId,
                      option.value ?? option.label,
                    )
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <form
              className="question-form"
              onSubmit={(event) => {
                event.preventDefault();
                const answer = questionAnswer.trim();
                if (!answer) return;
                onAnswerQuestion(snapshot.pendingQuestion!.questionId, answer);
                setQuestionAnswer("");
              }}
            >
              <textarea
                value={questionAnswer}
                onChange={(event) => setQuestionAnswer(event.target.value)}
                placeholder="Type your answer"
              />
              <div className="prompt-actions">
                <button className="primary-button" type="submit">
                  Send answer
                </button>
              </div>
            </form>
          )}
        </section>
        )}

        {(error || snapshot.error) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-destructive/45 bg-destructive/10 text-[#dca2a2] text-xs">
          <TriangleAlert size={15} />
          <span>{error ?? snapshot.error ?? "Unknown error"}</span>
          <X size={15} />
        </div>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
