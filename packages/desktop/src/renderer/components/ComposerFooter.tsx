import { useRef } from "react";
import { CircleStop, ImagePlus, Send, Sparkles, X } from "lucide-react";
import type { RuntimeStatus } from "../types.js";

interface ComposerFooterProps {
  images: Array<{ data: string; mimeType: string }>;
  draft: string;
  runtimeStatus: RuntimeStatus;
  isBusy: boolean;
  onDraftChange: (draft: string) => void;
  onAttachImages: (files: FileList | null) => void;
  onRemoveImage: (index: number) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function ComposerFooter({
  images,
  draft,
  runtimeStatus,
  isBusy,
  onDraftChange,
  onAttachImages,
  onRemoveImage,
  onSubmit,
  onStop,
}: ComposerFooterProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const isReady = runtimeStatus === "ready";
  const canSubmit = isReady && draft.trim().length > 0 && !isBusy;

  return (
    <footer className="composer-wrap">
      {images.length > 0 && (
        <div className="attachment-row">
          {images.map((image, index) => (
            <span key={`${image.mimeType}-${index}`} className="attachment-chip">
              <Sparkles size={12} />
              Image {index + 1}
              <button type="button" onClick={() => onRemoveImage(index)}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="composer-shell">
        <div className="composer-header-row">
          <span className="composer-hint">Enter to send · Shift+Enter for a new line</span>
          <span className={`composer-status ${isReady ? "ready" : "inactive"}`}>
            {isReady ? "Runtime ready" : "Runtime unavailable"}
          </span>
        </div>

        <div className="composer">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Ask CodeMap to inspect, explain, or change this workspace"
            disabled={!isReady}
          />

          <div className="composer-actions">
            <div className="composer-actions-left">
              <input
                ref={fileInput}
                hidden
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => onAttachImages(event.currentTarget.files)}
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() => fileInput.current?.click()}
                title="Attach image"
                disabled={!isReady}
              >
                <ImagePlus size={14} />
                Attach image
              </button>
            </div>

            {isBusy ? (
              <button className="stop-button" type="button" onClick={onStop}>
                <CircleStop size={16} />
                Stop
              </button>
            ) : (
              <button className="send-button" type="button" onClick={onSubmit} disabled={!canSubmit}>
                <Send size={16} />
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
