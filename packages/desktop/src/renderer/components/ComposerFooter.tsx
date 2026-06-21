import { useState, useMemo, useRef, useEffect } from "react";
import { CircleStop, Send, Server } from "lucide-react";
import type { RuntimeStatus } from "../types.js";
import type { McpStatusResult, ModelInfo } from "../../shared/ipc.js";
import { PromptInputActionMenuItem } from "./ai-elements/prompt-input.js";
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
} from "./ai-elements/prompt-input.js";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "./ai-elements/model-selector.js";

// ── Slash command definitions ─────────────────────────────────────────────────

interface SlashCommand {
  name: string;
  description: string;
  group: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: "help",     description: "Show available commands",       group: "General" },
  { name: "clear",    description: "Clear conversation",            group: "General" },
  { name: "status",   description: "Show connection status",        group: "General" },
  { name: "mcp",      description: "Show MCP servers",              group: "Tools"   },
  { name: "tools",    description: "List available agent tools",    group: "Tools"   },
  { name: "login",    description: "Log in to CodeMap",             group: "Account" },
  { name: "logout",   description: "Log out",                       group: "Account" },
  { name: "projects", description: "List cloud projects",           group: "Cloud"   },
  { name: "link",     description: "Link workspace to a project",   group: "Cloud"   },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface ComposerFooterProps {
  runtimeStatus: RuntimeStatus;
  isBusy: boolean;
  allowSubmitWhileBusy?: boolean;
  mode: "plan" | "build";
  selectedModel: string;
  availableModels: ModelInfo[];
  onModelChange: (model: string) => void;
  onSubmit: (
    content: string,
    images: Array<{ data: string; mimeType: string; filename?: string }>,
  ) => void | Promise<void>;
  onStop: () => void;
  onShowMcp?: () => void;
  onSlashCommand?: (name: string, args: string) => void;
  mcpOpen?: boolean;
  mcpSummary?: McpStatusResult | null;
  mcpLoading?: boolean;
  onCloseMcp?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupLabel(model: ModelInfo): string {
  if (model.ownedBy) {
    return model.ownedBy.charAt(0).toUpperCase() + model.ownedBy.slice(1);
  }
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

// ── Component ─────────────────────────────────────────────────────────────────

export function ComposerFooter({
  runtimeStatus,
  isBusy,
  allowSubmitWhileBusy = false,
  mode,
  selectedModel,
  availableModels,
  onModelChange,
  onSubmit,
  onStop,
  onShowMcp,
  onSlashCommand,
  mcpOpen = false,
  mcpSummary = null,
  mcpLoading = false,
  onCloseMcp,
}: ComposerFooterProps) {
  const [draft, setDraft] = useState("");
  const [slashQuery, setSlashQuery] = useState<string | null>(null); // null = closed
  const [slashActive, setSlashActive] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const isReady = runtimeStatus === "ready";

  // Filtered command list based on what user typed after "/"
  const filteredCommands = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.name.startsWith(q) || c.description.toLowerCase().includes(q));
  }, [slashQuery]);

  // Group filtered commands
  const groupedCommands = useMemo(() => {
    const groups = new Map<string, SlashCommand[]>();
    for (const cmd of filteredCommands) {
      const list = groups.get(cmd.group) ?? [];
      list.push(cmd);
      groups.set(cmd.group, list);
    }
    return [...groups.entries()];
  }, [filteredCommands]);

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

  // Close popup on outside click
  useEffect(() => {
    if (slashQuery === null) return;
    function onMouseDown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setSlashQuery(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [slashQuery]);

  // Reset active index when filtered list changes
  useEffect(() => {
    setSlashActive(0);
  }, [slashQuery]);

  function selectCommand(cmd: SlashCommand) {
    setSlashQuery(null);
    setDraft("");
    onSlashCommand?.(cmd.name, "");
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    // Show popup when draft starts with "/"
    if (value.startsWith("/")) {
      setSlashQuery(value.slice(1));
    } else {
      setSlashQuery(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (slashQuery === null || filteredCommands.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashActive((i) => (i + 1) % filteredCommands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashActive((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === "Enter" && filteredCommands[slashActive]) {
      e.preventDefault();
      selectCommand(filteredCommands[slashActive]);
    } else if (e.key === "Escape") {
      setSlashQuery(null);
    }
  }

  async function submit(message: PromptInputMessage) {
    const content = message.text.trim();
    const images = toRuntimeImages(message.files);
    if ((!content && images.length === 0) || !isReady || (isBusy && !allowSubmitWhileBusy)) return;

    // If it's a slash command typed directly and Enter pressed without selecting from popup
    if (content.startsWith("/") && !content.includes(" ") && slashQuery !== null) {
      const cmdName = content.slice(1).trim();
      const match = SLASH_COMMANDS.find((c) => c.name === cmdName);
      if (match) {
        setSlashQuery(null);
        setDraft("");
        onSlashCommand?.(match.name, "");
        return;
      }
    }

    setDraft("");
    setSlashQuery(null);
    await onSubmit(content, images);
  }

  // Flat index across groups for keyboard nav
  let flatIndex = 0;

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

      {/* Slash command popup */}
      {slashQuery !== null && filteredCommands.length > 0 && (
        <div className="slash-popup" ref={popupRef}>
          {groupedCommands.map(([group, cmds]) => (
            <div className="slash-group" key={group}>
              <div className="slash-group-label">{group}</div>
              {cmds.map((cmd) => {
                const isActive = flatIndex++ === slashActive;
                return (
                  <button
                    className={`slash-item${isActive ? " slash-item-active" : ""}`}
                    key={cmd.name}
                    onMouseDown={(e) => { e.preventDefault(); selectCommand(cmd); }}
                    type="button"
                  >
                    <span className="slash-item-name">/{cmd.name}</span>
                    <span className="slash-item-desc">{cmd.description}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

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
            onChange={(event) => handleDraftChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
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
                <PromptInputActionMenuItem onSelect={onShowMcp}>
                  <Server className="mr-2 size-4" />
                  MCP Servers
                </PromptInputActionMenuItem>
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <ModelSelector
              onValueChange={onModelChange}
              value={selectedModel}
            >
              <ModelSelectorTrigger disabled={!isReady} />
              <ModelSelectorContent>
                <ModelSelectorInput placeholder="Search models..." />
                <ModelSelectorList>
                  <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                  {groupedModels.map(([label, groupModels]) => (
                    <ModelSelectorGroup heading={label} key={label}>
                      {groupModels.map((model) => (
                        <ModelSelectorItem
                          key={model.id}
                          onSelect={() => onModelChange(model.id)}
                          value={model.id}
                        >
                          <ModelSelectorLogo
                            provider={model.ownedBy ?? model.id.split(/[/:.-]/)[0] ?? "unknown"}
                          />
                          <ModelSelectorName>{model.id}</ModelSelectorName>
                        </ModelSelectorItem>
                      ))}
                    </ModelSelectorGroup>
                  ))}
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
          </PromptInputTools>

          {isBusy && !allowSubmitWhileBusy ? (
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

      {mcpOpen && mcpSummary && (
        <div className="mcp-panel">
          <div className="mcp-panel-header">
            <span className="mcp-panel-title">MCP</span>
            <button
              className="mcp-panel-close"
              onClick={onCloseMcp}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="mcp-panel-body">
            {mcpLoading ? (
              <p className="mcp-panel-empty">Loading…</p>
            ) : !mcpSummary.hasServers ? (
              <p className="mcp-panel-empty">No MCP servers configured.</p>
            ) : (
              <>
                <table className="mcp-table">
                  <thead>
                    <tr>
                      <th>Server</th>
                      <th>Auth</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mcpSummary.statuses.map((server) => (
                      <tr key={server.name}>
                        <td className="mcp-cell-name">{server.name}</td>
                        <td className="mcp-cell-auth">
                          {server.transport === "http" ? "Authenticated" : "Auth unsupported"}
                        </td>
                        <td className="mcp-cell-status">
                          <span
                            className={
                              server.connected
                                ? "mcp-status-enabled"
                                : server.connecting
                                  ? "mcp-status-connecting"
                                  : "mcp-status-disabled"
                            }
                          >
                            {server.connected
                              ? "Enabled"
                              : server.connecting
                                ? "Connecting…"
                                : server.error
                                  ? "Error"
                                  : "Disabled"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mcpSummary.skipped.length > 0 && (
                  <div className="mcp-skipped-section">
                    <div className="mcp-skipped-header">Skipped</div>
                    <table className="mcp-table">
                      <tbody>
                        {mcpSummary.skipped.map((s) => (
                          <tr key={s.name} className="mcp-row-skipped">
                            <td className="mcp-cell-name">{s.name}</td>
                            <td className="mcp-cell-auth">—</td>
                            <td className="mcp-cell-status mcp-reason-text">{s.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </footer>
  );
}
