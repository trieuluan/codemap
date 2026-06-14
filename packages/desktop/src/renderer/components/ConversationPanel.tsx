import { useMemo, useState } from "react";
import {
  CircleHelp,
  FileCode2,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type { SessionSnapshot, SessionMessage } from "@codemap-ai/core/agent/contracts";
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

function renderMessageText(content: string) {
  return content.split(/\n{2,}/).map((block, index) => (
    <p key={`${index}-${block.slice(0, 20)}`}>
      {block}
    </p>
  ));
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
    <div className="conversation">
      {displayMessages.length === 0 ? (
        <div className="empty-chat">
          <div className="empty-chat-icon">
            <FileCode2 size={25} />
          </div>
          <h2>What are we building?</h2>
          <p>
            Mention files with <code>@path/to/file</code>, attach images, or ask
            CodeMap to inspect and modify this workspace.
          </p>
        </div>
      ) : (
        <div className="message-stack">
          {displayMessages.map((message) => (
            <article
              key={(message as { localId?: string; id?: string }).localId ?? message.id}
              className={message.role === "user" ? "message-row user" : "message-row assistant"}
            >
              <div className="message-avatar">
                {message.role === "user" ? "You" : "AI"}
              </div>
              <div className="message-card">
                <div className="message-role">
                  {message.role === "user" ? "You" : "CodeMap"}
                </div>
                <div className="message-body">{renderMessageText(message.content)}</div>
              </div>
            </article>
          ))}
        </div>
      )}

      {snapshot.thinkingText && isBusy && (
        <div className="thinking-row">
          <LoaderCircle className="spin" size={14} />
          <span>Reasoning in progress</span>
        </div>
      )}

      {orderedTools.length > 0 && (
        <section className="tool-stack">
          <div className="section-label">
            <Sparkles size={14} />
            Tool activity
          </div>
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
        <div className="error-banner">
          <TriangleAlert size={15} />
          <span>{error ?? snapshot.error ?? "Unknown error"}</span>
          <X size={15} />
        </div>
      )}
    </div>
  );
}
