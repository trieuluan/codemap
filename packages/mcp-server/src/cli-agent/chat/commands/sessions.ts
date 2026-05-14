import type { Command } from "./types.js";
import {
  listSessions,
  deleteSession,
  type SessionMeta,
} from "../session-store.js";

function formatAge(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatSession(i: number, s: SessionMeta, current: boolean): string {
  const tok = s.tokenCount > 0 ? ` · ${Math.round(s.tokenCount / 1000)}k tok` : "";
  const bullet = current ? " ●" : "";
  return `${i + 1}.${bullet} ${s.name}  [${s.messageCount} msgs${tok}]  ${formatAge(s.updatedAt)}`;
}

export const sessionsCommand: Command = {
  name: "sessions",
  description: "List, load, or create chat sessions. Usage: /sessions [new|load <n>|delete <n>]",
  execute: async (args, ctx) => {
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    const [sub, ...rest] = args.trim().split(/\s+/);

    // /sessions new
    if (sub === "new") {
      ctx.newSession?.();
      append("Started a new session. History cleared.");
      return;
    }

    // /sessions load <n>
    if (sub === "load" && rest[0]) {
      const idx = parseInt(rest[0], 10) - 1;
      const sessions = listSessions(10);
      const target = sessions[idx];
      if (!target) {
        append(`No session #${idx + 1}. Run /sessions to list.`);
        return;
      }
      ctx.loadSessionById?.(target.id);
      return;
    }

    // /sessions delete <n>
    if (sub === "delete" && rest[0]) {
      const idx = parseInt(rest[0], 10) - 1;
      const sessions = listSessions(10);
      const target = sessions[idx];
      if (!target) {
        append(`No session #${idx + 1}.`);
        return;
      }
      deleteSession(target.id);
      append(`Deleted session: ${target.name}`);
      return;
    }

    // /sessions — list
    const sessions = listSessions(10);
    if (sessions.length === 0) {
      append("No saved sessions yet.");
      return;
    }
    const currentId = ctx.currentSessionId;
    const lines = ["**Recent sessions** (newest first):", ""];
    sessions.forEach((s, i) => {
      lines.push(formatSession(i, s, s.id === currentId));
    });
    lines.push("", "_/sessions new · /sessions load <n> · /sessions delete <n>_");
    append(lines.join("\n"));
  },
};
