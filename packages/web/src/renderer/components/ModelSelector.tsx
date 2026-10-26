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
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        className="inline-flex min-w-[190px] cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-[7px] disabled:cursor-not-allowed disabled:opacity-55"
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bot size={15} />
        <span className="grid min-w-0 flex-1 text-left">
          <span className="text-[10px] uppercase text-[var(--muted)]">Model</span>
          <code className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">{selectedModel}</code>
        </span>
        <ChevronDown size={14} className={`transition-transform duration-100 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[min(320px,80vw)] overflow-hidden rounded-[14px] border border-[var(--border-strong)] bg-[#121214] shadow-[0_18px_44px_rgb(0_0_0/40%)]" role="dialog" aria-label="Choose model">
          <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
            <Search size={14} />
            <input
              autoFocus
              className="w-full border-0 bg-transparent text-[#ededee] outline-0"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models"
            />
          </div>

          <div className="max-h-[320px] overflow-auto p-2.5">
            {groupedModels.length === 0 ? (
              <p className="px-2 py-[18px] text-center text-[var(--muted)]">No models match that search.</p>
            ) : (
              groupedModels.map(([label, groupModels]) => (
                <section className="grid gap-1.5 [&+section]:mt-2.5" key={label}>
                  <header className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{label}</header>
                  {groupModels.map((model) => {
                    const active = model === selectedModel;
                    return (
                      <button
                        key={model}
                        type="button"
                        className={`flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-[10px] border border-transparent bg-transparent px-2.5 py-[9px] text-left text-[#ededee] hover:border-[var(--border)] hover:bg-[var(--hover)] ${active ? "border-[var(--border)] bg-[var(--hover)]" : ""}`}
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
