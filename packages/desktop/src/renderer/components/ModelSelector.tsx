import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, Search } from "lucide-react";

interface ModelSelectorProps {
  models: string[];
  selectedModel: string;
  disabled?: boolean;
  onSelect: (model: string) => void;
}

function groupLabel(model: string): string {
  const prefix = model.split(/[/:.-]/)[0]?.trim();
  if (!prefix) return "Other";
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export function ModelSelector({
  models,
  selectedModel,
  disabled = false,
  onSelect,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filteredModels = useMemo(() => {
    const list = models.length > 0 ? models : [selectedModel];
    const lowered = query.trim().toLowerCase();
    return list.filter((model) => model.toLowerCase().includes(lowered));
  }, [models, query, selectedModel]);

  const groupedModels = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const model of filteredModels) {
      const label = groupLabel(model);
      const current = groups.get(label) ?? [];
      current.push(model);
      groups.set(label, current);
    }
    return [...groups.entries()];
  }, [filteredModels]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="model-selector" ref={rootRef}>
      <button
        ref={triggerRef}
        className="model-selector-trigger"
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bot size={15} />
        <span className="model-selector-label">
          <span className="model-selector-title">Model</span>
          <code>{selectedModel}</code>
        </span>
        <ChevronDown size={14} className={open ? "model-selector-chevron open" : "model-selector-chevron"} />
      </button>

      {open && (
        <div className="model-selector-popover" role="dialog" aria-label="Choose model">
          <div className="model-selector-search">
            <Search size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models"
            />
          </div>

          <div className="model-selector-list">
            {groupedModels.length === 0 ? (
              <p className="model-selector-empty">No models match that search.</p>
            ) : (
              groupedModels.map(([label, groupModels]) => (
                <section className="model-selector-group" key={label}>
                  <header>{label}</header>
                  {groupModels.map((model) => {
                    const active = model === selectedModel;
                    return (
                      <button
                        key={model}
                        type="button"
                        className={active ? "model-option active" : "model-option"}
                        onClick={() => {
                          onSelect(model);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <span>{model}</span>
                        {active && <Check size={14} />}
                      </button>
                    );
                  })}
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
