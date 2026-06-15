import { useState } from "react";
import { CircleStop, ImagePlus, Send } from "lucide-react";
import type { RuntimeStatus } from "../types.js";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "../../components/ai-elements/prompt-input.js";

interface ComposerFooterProps {
  runtimeStatus: RuntimeStatus;
  isBusy: boolean;
  mode: "plan" | "build";
  onSubmit: (
    content: string,
    images: Array<{ data: string; mimeType: string }>,
  ) => void;
  onStop: () => void;
}

function toRuntimeImages(files: PromptInputMessage["files"]) {
  return files.flatMap((file) => {
    if (!file.url?.startsWith("data:")) return [];
    const separator = file.url.indexOf(",");
    if (separator === -1) return [];
    return [{
      data: file.url.slice(separator + 1),
      mimeType: file.mediaType || "image/png",
    }];
  });
}

export function ComposerFooter({
  runtimeStatus,
  isBusy,
  mode,
  onSubmit,
  onStop,
}: ComposerFooterProps) {
  const [draft, setDraft] = useState("");
  const isReady = runtimeStatus === "ready";

  function submit(message: PromptInputMessage) {
    const content = message.text.trim();
    if (!content || !isReady || isBusy) return;
    onSubmit(content, toRuntimeImages(message.files));
    setDraft("");
  }

  return (
    <footer className="composer-wrap">
      <div className="composer-header-row">
        <span className="composer-hint">Enter to send · Shift+Enter for a new line</span>
        <span className={`composer-status ${isReady ? "ready" : "inactive"}`}>
          {!isReady
            ? "Runtime unavailable"
            : mode === "plan"
              ? "Plan · read-only"
              : "Build · runtime ready"}
        </span>
      </div>

      <PromptInput
        accept="image/*"
        className="composer"
        maxFiles={8}
        multiple
        onSubmit={submit}
      >
        <PromptInputAttachments className="attachment-row">
          {(attachment) => <PromptInputAttachment data={attachment} />}
        </PromptInputAttachments>
        <PromptInputBody>
          <PromptInputTextarea
            disabled={!isReady}
            onChange={(event) => setDraft(event.currentTarget.value)}
            placeholder={
              mode === "plan"
                ? "Plan mode — ask CodeMap to explore or explain (read-only)"
                : "Ask CodeMap to inspect, explain, or change this workspace"
            }
            value={draft}
          />
        </PromptInputBody>
        <PromptInputFooter className="composer-actions">
          <PromptInputTools className="composer-actions-left">
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger className="secondary-button" disabled={!isReady}>
                <ImagePlus size={14} />
                <span>Attach image</span>
              </PromptInputActionMenuTrigger>
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments label="Add images" />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          </PromptInputTools>

          {isBusy ? (
            <button className="stop-button" onClick={onStop} type="button">
              <CircleStop size={15} />
              Stop
            </button>
          ) : (
            <PromptInputSubmit
              aria-label="Send message"
              className="send-button"
              disabled={!isReady || !draft.trim()}
              status="ready"
              title="Send message"
            >
              <Send size={16} />
            </PromptInputSubmit>
          )}
        </PromptInputFooter>
      </PromptInput>
    </footer>
  );
}
