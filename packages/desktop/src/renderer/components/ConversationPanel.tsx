import { useMemo, useState } from "react";
import {
  Check,
  CircleHelp,
  Copy,
  FileCode2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type { SessionSnapshot } from "@codemap-ai/core/agent/contracts";
import type { LocalMessage } from "../hooks/useAgentSession.js";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation.js";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "../../components/ai-elements/message.js";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../components/ai-elements/reasoning.js";
import { ToolExecution } from "./ToolExecution.js";

interface ConversationPanelProps {
  displayMessages: LocalMessage[];
  snapshot: SessionSnapshot;
  error: string | null;
  isBusy: boolean;
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

export function ConversationPanel({
  displayMessages,
  snapshot,
  error,
  isBusy,
  onApprove,
  onDecline,
  onAnswerQuestion,
  onSubmitPrompt,
}: ConversationPanelProps) {
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | undefined>(undefined);

  const orderedTools = useMemo(() => [...snapshot.tools], [snapshot.tools]);
  const latestAssistantIndex = displayMessages.findLastIndex(
    (message) => message.role === "assistant",
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
    <Conversation className="conversation">
      <ConversationContent className="conversation-content">
        {displayMessages.length === 0 ? (
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
        ) : (
          <div className="message-stack">
          {displayMessages.map((message, index) => {
            const id = messageId(message);
            const previousUserMessage = displayMessages
              .slice(0, index)
              .findLast((candidate) => candidate.role === "user");
            const isLatestAssistant =
              message.role === "assistant" && index === latestAssistantIndex;

            const isUser = message.role === "user";

            return (
              <div key={id} className="turn-group">
                {/* Tool calls that ran during this assistant turn (before the response) */}
                {!isUser && message.tools && message.tools.length > 0 && (
                  <section className="tool-stack">
                    {message.tools.map((tool) => (
                      <ToolExecution
                        key={tool.toolCallId}
                        toolCallId={tool.toolCallId}
                        name={tool.name}
                        args={tool.args}
                        preview={tool.preview}
                        result={tool.result}
                        isError={tool.isError}
                      />
                    ))}
                  </section>
                )}
                {(isUser || message.content) && <article
                  className={`message-row ${isUser ? "message-row-user" : ""}`}
                  data-role={message.role}
                >
                  <div className="min-w-0">
                    <Message
                      className="codemap-message"
                      from={isUser ? "user" : "assistant"}
                    >
                      <MessageContent className="codemap-message-content message-body">
                        <MessageResponse>{message.content}</MessageResponse>
                      </MessageContent>
                    </Message>
                    {isLatestAssistant && message.content && !isBusy && (
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
                    )}
                  </div>
                </article>}
              </div>
            );
          })}

          {/* Live tool calls for the current in-progress turn */}
          {isBusy && orderedTools.length > 0 && (
            <section className="tool-stack tool-stack-live">
              {orderedTools.map((tool) => (
                <ToolExecution
                  key={tool.toolCallId}
                  toolCallId={tool.toolCallId}
                  name={tool.name}
                  args={tool.args}
                  preview={tool.preview}
                  result={tool.result}
                  isError={tool.isError}
                />
              ))}
            </section>
          )}
          </div>
        )}

        {snapshot.thinkingText && (
          <div className="turn-activity thinking-row">
            <Reasoning className="codemap-reasoning" defaultOpen={isBusy} isStreaming={isBusy}>
              <ReasoningTrigger
                getThinkingMessage={(streaming, duration) =>
                  streaming
                    ? "Reasoning..."
                    : `Reasoned for ${duration ?? "a few"} seconds`
                }
              />
              <ReasoningContent className="codemap-reasoning-content">
                {snapshot.thinkingText}
              </ReasoningContent>
            </Reasoning>
          </div>
        )}

        {snapshot.pendingApproval && (
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
