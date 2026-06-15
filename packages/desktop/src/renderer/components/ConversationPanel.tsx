import { useMemo, useState } from "react";
import {
  CircleHelp,
  FileCode2,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { SessionSnapshot, SessionMessage } from "@codemap-ai/core/agent/contracts";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation.js";
import {
  Message,
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
  displayMessages: SessionMessage[];
  snapshot: SessionSnapshot;
  error: string | null;
  isBusy: boolean;
  onApprove: (approvalId: string) => void;
  onDecline: (approvalId: string) => void;
  onAnswerQuestion: (questionId: string, answer: string) => void;
}

export function ConversationPanel({
  displayMessages,
  snapshot,
  error,
  isBusy,
  onApprove,
  onDecline,
  onAnswerQuestion,
}: ConversationPanelProps) {
  const [questionAnswer, setQuestionAnswer] = useState("");

  const orderedTools = useMemo(() => [...snapshot.tools], [snapshot.tools]);

  return (
    <Conversation className="conversation">
      <ConversationContent className="conversation-content">
        {displayMessages.length === 0 ? (
          <ConversationEmptyState
            className="empty-chat"
            icon={
              <span className="grid w-[52px] h-[52px] place-items-center border border-border rounded-[14px] bg-card">
                <FileCode2 size={25} />
              </span>
            }
            title="What are we building?"
            description="Mention files with @path/to/file, attach images, or ask CodeMap to inspect and modify this workspace."
          />
        ) : (
          <div className="grid gap-[18px]">
          {displayMessages.map((message) => (
            <article
              key={(message as { localId?: string; id?: string }).localId ?? message.id}
              className={`flex flex-col gap-1.5 ${message.role === "user" ? "items-end" : ""}`}
            >
              <Message
                className="codemap-message grid gap-2 p-3 border border-border rounded-[10px] bg-card"
                from={message.role === "user" ? "user" : "assistant"}
              >
                <MessageContent className="codemap-message-content">
                  <MessageResponse>{message.content}</MessageResponse>
                </MessageContent>
              </Message>
            </article>
          ))}
          </div>
        )}

        {snapshot.thinkingText && (
          <div className="grid gap-1.5">
            <Reasoning className="codemap-reasoning text-muted-foreground text-xs italic" isStreaming={isBusy}>
              <ReasoningTrigger />
              <ReasoningContent>{snapshot.thinkingText}</ReasoningContent>
            </Reasoning>
          </div>
        )}

        {orderedTools.length > 0 && (
          <section className="grid gap-[18px]">
            {orderedTools.map((tool) => (
              <ToolExecution
                key={tool.toolCallId}
                toolCallId={tool.toolCallId}
                name={tool.name}
                preview={tool.preview}
                result={tool.result}
              />
            ))}
          </section>
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
