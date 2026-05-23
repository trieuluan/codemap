import type { Command } from "./types.js";
import type { HarnessMessage, HarnessThread } from "../runtime/mastra-events.js";
import {
  listMastraThreads,
  listMastraThreadMessages,
} from "../runtime/mastra-harness-runtime.js";
import type { Message } from "../ui/store.js";

function formatAge(date: Date): string {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatThread(i: number, t: HarnessThread, current: boolean): string {
  const tok = t.tokenUsage?.totalTokens
    ? ` · ${Math.round(t.tokenUsage.totalTokens / 1000)}k tok`
    : "";
  const title = t.title ?? t.id.slice(0, 8);
  const bullet = current ? " ●" : "";
  return `${i + 1}.${bullet} ${title}${tok}  ${formatAge(t.updatedAt)}`;
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

export function mapHarnessMessagesToUI(messages: HarnessMessage[]): Message[] {
  const result: Message[] = [];
  for (const msg of messages) {
    const ts = msg.createdAt.getTime();
    if (msg.role === "user") {
      const raw = extractText(msg.content);
      result.push({ role: "user", content: extractTaskContent(raw), timestamp: ts });
    } else if (msg.role === "assistant") {
      let textParts = "";
      for (const part of msg.content) {
        if (part.type === "text") {
          textParts += (part as { type: "text"; text: string }).text;
        } else if (part.type === "tool_call") {
          const p = part as { type: "tool_call"; name: string };
          if (textParts.trim()) {
            result.push({ role: "assistant", content: textParts.trim(), timestamp: ts });
            textParts = "";
          }
          result.push({ role: "tool_call", name: p.name, content: `Call ${p.name}`, timestamp: ts });
        } else if (part.type === "tool_result") {
          const p = part as { type: "tool_result"; name: string; result: unknown; isError: boolean };
          const resultText = typeof p.result === "string" ? p.result : JSON.stringify(p.result ?? "");
          result.push({
            role: "tool",
            name: p.name,
            content: p.isError ? `[ERROR] ${resultText}` : resultText,
            timestamp: ts,
          });
        }
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

export const sessionsCommand: Command = {
  name: "sessions",
  description: "List or load Mastra chat threads. Usage: /sessions [new|load <n>]",
  execute: async (args, ctx) => {
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content, timestamp: Date.now() }]);

    const [sub, ...rest] = args.trim().split(/\s+/);

    if (sub === "new") {
      ctx.newSession?.();
      append("Started a new session.");
      return;
    }

    if (sub === "load" && rest[0]) {
      const idx = parseInt(rest[0], 10) - 1;
      const threads = await listMastraThreads();
      const target = threads[idx];
      if (!target) {
        append(`No thread #${idx + 1}. Run /sessions to list.`);
        return;
      }
      await ctx.loadThreadById?.(target.id);
      return;
    }

    // List
    const threads = await listMastraThreads();
    if (threads.length === 0) {
      append("No saved threads yet.");
      return;
    }
    const currentId = ctx.getMastraThreadId?.() ?? null;
    const lines = ["**Recent threads** (newest first):", ""];
    [...threads]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 10)
      .forEach((t, i) => lines.push(formatThread(i, t, t.id === currentId)));
    lines.push("", "_/sessions new · /sessions load <n>_");
    append(lines.join("\n"));
  },
};

export async function loadThreadIntoUI(
  threadId: string,
  setMessages: (msgs: Message[]) => void,
  appendMessage: (msg: { role: string; content: string }) => void,
): Promise<void> {
  const harnessMessages = await listMastraThreadMessages(threadId, 200);
  if (harnessMessages.length === 0) {
    appendMessage({ role: "system", content: "Thread is empty." });
    return;
  }
  const uiMessages = mapHarnessMessagesToUI(harnessMessages);
  setMessages([
    ...uiMessages,
    { role: "system", content: `_Thread loaded · ${uiMessages.filter(m => m.role === "user").length} turns_`, timestamp: Date.now() },
  ]);
}
