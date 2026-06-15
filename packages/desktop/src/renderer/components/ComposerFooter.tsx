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
    <footer className="border-t border-[var(--border)] bg-[rgb(11_11_12/96%)] px-[max(24px,calc((100%-860px)/2))] pb-[18px] pt-[14px]">
      <div className="mb-2 flex items-center justify-between gap-2.5">
        <span className="text-xs text-[var(--muted)]">Enter to send · Shift+Enter for a new line</span>
        <span className={`text-xs ${isReady ? "text-[#b5ddc0]" : "text-[#ddb7b7]"}`}>
          {!isReady
            ? "Runtime unavailable"
            : mode === "plan"
              ? "Plan · read-only"
              : "Build · runtime ready"}
        </span>
      </div>

      <PromptInput
        accept="image/*"
        maxFiles={8}
        multiple
        onSubmit={submit}
      >
        <div className="rounded-[14px] border border-[var(--border-strong)] bg-[#111112] p-3 shadow-[0_10px_40px_rgb(0_0_0/18%)] focus-within:border-[#55555a]">
          <PromptInputAttachments className="flex flex-wrap gap-1.5">
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputBody>
            <PromptInputTextarea
              className="w-full min-h-[78px] max-h-[220px] resize-y border-0 outline-0 bg-transparent text-[14px] leading-[1.6] text-[#ededee] placeholder:text-[var(--muted)]"
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
          <PromptInputFooter className="mt-2.5 flex items-center justify-between gap-2.5">
            <PromptInputTools className="flex items-center gap-2">
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
                className="send-button"
                disabled={!isReady || !draft.trim()}
                status="ready"
              >
                <Send size={16} />
                Send
              </PromptInputSubmit>
            )}
          </PromptInputFooter>
        </div>
      </PromptInput>
    </footer>
  );
}
