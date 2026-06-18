import { useState, useMemo } from "react";
import { CircleStop, Send } from "lucide-react";
import type { RuntimeStatus } from "../types.js";
import type { ModelInfo } from "../../shared/ipc.js";
import { SelectGroup, SelectLabel } from "./ui/select.js";
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
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "./ai-elements/prompt-input.js";

interface ComposerFooterProps {
  runtimeStatus: RuntimeStatus;
  isBusy: boolean;
  mode: "plan" | "build";
  selectedModel: string;
  availableModels: ModelInfo[];
  onModelChange: (model: string) => void;
  onSubmit: (
    content: string,
    images: Array<{ data: string; mimeType: string; filename?: string }>,
  ) => void;
  onStop: () => void;
}

function groupLabel(model: ModelInfo): string {
  if (model.ownedBy) {
    // Capitalize first letter of ownedBy (e.g., "anthropic" → "Anthropic")
    return model.ownedBy.charAt(0).toUpperCase() + model.ownedBy.slice(1);
  }
  // Fallback: extract prefix from model id
  const prefix = model.id.split(/[/:.-]/)[0]?.trim();
  if (!prefix) return "Other";
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

function toRuntimeImages(files: PromptInputMessage["files"]) {
  return files.flatMap((file) => {
    if (!file.url?.startsWith("data:")) return [];
    const separator = file.url.indexOf(",");
    if (separator === -1) return [];
    return [{
      data: file.url.slice(separator + 1),
      mimeType: file.mediaType || "image/png",
      filename: file.filename,
    }];
  });
}

export function ComposerFooter({
  runtimeStatus,
  isBusy,
  mode,
  selectedModel,
  availableModels,
  onModelChange,
  onSubmit,
  onStop,
}: ComposerFooterProps) {
  const [draft, setDraft] = useState("");
  const isReady = runtimeStatus === "ready";

  const groupedModels = useMemo(() => {
    const models = availableModels.length > 0 ? availableModels : [{ id: selectedModel }];
    const groups = new Map<string, ModelInfo[]>();
    for (const model of models) {
      const label = groupLabel(model);
      const current = groups.get(label) ?? [];
      current.push(model);
      groups.set(label, current);
    }
    return [...groups.entries()];
  }, [availableModels, selectedModel]);

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
              <PromptInputActionMenuTrigger disabled={!isReady} />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <PromptInputSelect
              disabled={!isReady}
              onValueChange={onModelChange}
              value={selectedModel}
            >
              <PromptInputSelectTrigger>
                <PromptInputSelectValue />
              </PromptInputSelectTrigger>
              <PromptInputSelectContent>
                {groupedModels.map(([label, groupModels]) => (
                  <SelectGroup key={label}>
                    <SelectLabel>{label}</SelectLabel>
                    {groupModels.map((model) => (
                      <PromptInputSelectItem key={model.id} value={model.id}>
                        {model.id}
                      </PromptInputSelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </PromptInputSelectContent>
            </PromptInputSelect>
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
