import type { Command } from "./types.js";
import type { HarnessMessage, HarnessThread } from "../../agent/runtime/events.js";
import { listMastraThreads } from "../../agent/runtime/harness-runtime.js";
import type { Message } from "../state/store.js";
import { normalizeToolDisplayName } from "../terminal/tool-call-messages.js";
import { C_SUCCESS, C_ERROR, RESET } from "../../tui/theme.js";

function stringifyToolResult(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result ?? "");
}

function attachToolResult(
  messages: Message[],
  part: { id: string; name: string; result: unknown; isError: boolean },
  timestamp: number,
): void {
  const resultText = stringifyToolResult(part.result);
  const content = part.isError ? `[ERROR] ${resultText}` : resultText;
  const toolResult = {
    name: part.name,
    content,
    fullContent: content,
    success: !part.isError,
  };

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;
    if (msg.role === "user" || msg.role === "assistant" || msg.role === "system") break;
    if (
      msg.role === "tool_call" &&
      (msg.toolCallId === part.id || (!msg.toolCallId && msg.name === part.name))
    ) {
      const marker = part.isError ? ` ${C_ERROR}✗${RESET}` : ` ${C_SUCCESS}✓${RESET}`;
      messages[i] = {
        ...msg,
        toolCallId: msg.toolCallId ?? part.id,
        toolResults: [...(msg.toolResults ?? []), toolResult],
        expandedContent: content,
        content: msg.content.includes(`${RESET}`) ? msg.content : `${msg.content}${marker}`,
      };
      return;
    }
  }

  const marker = part.isError ? ` ${C_ERROR}✗${RESET}` : ` ${C_SUCCESS}✓${RESET}`;
  messages.push({
    role: "tool_call",
    name: part.name,
    toolCallId: part.id,
    content: `${normalizeToolDisplayName(part.name)}${marker}`,
    toolResults: [toolResult],
    expandedContent: content,
    timestamp,
  });
}

function extractText(content: HarnessMessage["content"]): string {
  return content
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join(" ");
}

function extractTaskContent(raw: string): string {
  const match = raw.match(/<task>\n([\s\S]*?)\n<\/task>/);
  return match?.[1]?.trim() ?? raw.trim();
}

function toTimestamp(date: Date | string): number {
  return date instanceof Date ? date.getTime() : new Date(date).getTime();
}

export function mapHarnessMessagesToUI(messages: HarnessMessage[]): Message[] {
  const result: Message[] = [];
  for (const msg of messages) {
    const ts = toTimestamp(msg.createdAt as Date | string);
    if (msg.role === "user") {
      const raw = extractText(msg.content);
      result.push({ role: "user", content: extractTaskContent(raw), timestamp: ts });
    } else if (msg.role === "assistant") {
      let textParts = "";
      for (const part of msg.content) {
        if (part.type === "text") {
          textParts += (part as { type: "text"; text: string }).text;
        } else if (part.type === "thinking") {
          textParts += `[Thinking]: ${(part as { type: "thinking"; thinking: string }).thinking}
`;
        } else if (part.type === "tool_call") {
          const p = part as { type: "tool_call"; id: string; name: string };
          if (textParts.trim()) {
            result.push({ role: "assistant", content: textParts.trim(), timestamp: ts });
            textParts = "";
          }
          result.push({ role: "tool_call", name: p.name, toolCallId: p.id, content: normalizeToolDisplayName(p.name), timestamp: ts });
        } else if (part.type === "tool_result") {
          attachToolResult(result, part as { type: "tool_result"; id: string; name: string; result: unknown; isError: boolean }, ts);
        } else if (part.type === "image") {
          const p = part as { type: "image"; mimeType: string };
          result.push({ role: "system", content: `[Image: ${p.mimeType}]`, timestamp: ts });
        } else if (part.type === "file") {
          const p = part as { type: "file"; mediaType: string; filename?: string };
          const label = p.filename ? `${p.filename} (${p.mediaType})` : p.mediaType;
          result.push({ role: "system", content: `[File: ${label}]`, timestamp: ts });
        } else if (part.type === "system_reminder") {
          const p = part as { type: "system_reminder"; message: string };
          result.push({ role: "system", content: `[Reminder] ${p.message}`, timestamp: ts });
        }
        // om_observation_start/end/failed, om_thread_title_updated → internal, skip
      }
      if (textParts.trim()) {
        result.push({ role: "assistant", content: textParts.trim(), timestamp: ts });
      }
    } else if (msg.role === "system") {
      const text = extractText(msg.content);
      if (text) result.push({ role: "system", content: text, timestamp: ts });
    }
  }
  return result;
}

export function formatAge(date: Date | string): string {
  const diff = Date.now() - toTimestamp(date);
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getThreadTokenUsage(
  t: HarnessThread,
): { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined {
  const metaUsage = (t.metadata as Record<string, unknown> | undefined)?.tokenUsage as
    | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
    | undefined;
  if (metaUsage?.totalTokens) return metaUsage;
  return t.tokenUsage;
}

export function formatSessionLabel(t: HarnessThread, current: boolean): string {
  const usage = getThreadTokenUsage(t);
  const tok = usage?.totalTokens ? ` · ${Math.round(usage.totalTokens / 1000)}k tok` : "";
  const title = t.title ?? t.id.slice(0, 8);
  const bullet = current ? " ●" : "";
  return `${t.id.slice(0, 8)}${bullet} ${title}${tok}  ${formatAge(t.updatedAt as Date | string)}`;
}

/** Sort threads by updatedAt descending (newest first). */
export function sortThreads(threads: HarnessThread[]): HarnessThread[] {
  return [...threads].sort(
    (a, b) => toTimestamp(b.updatedAt as Date | string) - toTimestamp(a.updatedAt as Date | string),
  );
}

export const sessionsCommand: Command = {
  name: "sessions",
  description: "List saved chat threads. Use the picker to switch.",
  /** When true, pi-tui-app will open the inline session picker instead of printing a list. */
  triggerSessionPicker: true,
  execute: async (_args, ctx) => {
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content, timestamp: Date.now() }]);

    const threads = await listMastraThreads();
    if (threads.length === 0) {
      append("No saved threads yet.");
      return;
    }

    const sortedThreads = sortThreads(threads);

    // Fallback for non-TUI contexts: print list.
    const currentId = ctx.getMastraThreadId?.() ?? null;
    const lines = ["**Recent threads** (newest first):", ""];
    sortedThreads
      .slice(0, 10)
      .forEach((t) => lines.push(`\`${formatSessionLabel(t, t.id === currentId)}\``));
    append(lines.join("\n"));
  },
};
