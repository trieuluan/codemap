import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../types.js";
import type { Message } from "./ui/store.js";
import { formatToolUiResult } from "./agent/agent-loop.js";

function resolveDbPath(): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  const root = result.stdout?.trim();
  const base = root || process.cwd();
  return path.join(base, ".codemap", "sessions.db");
}

const DB_PATH = resolveDbPath();
const TOOL_RESULT_TRUNCATE = 3000;

export interface SessionMeta {
  id: string;
  name: string;
  gitRepo: string;
  gitBranch: string;
  model: string;
  tokenCount: number;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

function openDb(): DatabaseSync {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      git_repo    TEXT    NOT NULL DEFAULT '',
      git_branch  TEXT    NOT NULL DEFAULT '',
      model       TEXT    NOT NULL DEFAULT '',
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      idx          INTEGER NOT NULL,
      role         TEXT    NOT NULL,
      content      TEXT    NOT NULL,
      tool_calls   TEXT,
      tool_call_id TEXT,
      msg_name     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_session_messages_session
      ON session_messages(session_id, idx);
  `);
  return db;
}

// ─── Helpers ──────────────────────────────────────────────

function truncateAgentHistory(history: ChatMessage[]): ChatMessage[] {
  return history.map((msg) => {
    if (msg.role === "tool" && msg.content.length > TOOL_RESULT_TRUNCATE) {
      return { ...msg, content: msg.content.slice(0, TOOL_RESULT_TRUNCATE) + "\n[truncated]" };
    }
    return msg;
  });
}

function agentHistoryToUiMessages(history: ChatMessage[]): Message[] {
  return history.map((msg) => ({
    role: msg.role as Message["role"],
    // Apply the same UI formatting as the live path so session-loaded tool
    // messages look identical to what was shown during the original session.
    content: msg.role === "tool" && msg.name
      ? formatToolUiResult(msg.name, msg.content)
      : msg.content,
    ...(msg.name ? { toolName: msg.name } : {}),
    ...(msg.toolCalls
      ? {
          toolCalls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          })),
        }
      : {}),
  }));
}

// ─── Public API ───────────────────────────────────────────

export function createSession(opts: {
  gitRepo: string;
  gitBranch: string;
  model: string;
}): string {
  const db = openDb();
  const id = randomUUID();
  const now = Date.now();
  const name = opts.gitBranch
    ? `${opts.gitBranch} · ${new Date(now).toLocaleString()}`
    : new Date(now).toLocaleString();
  db.prepare(
    `INSERT INTO sessions (id, name, git_repo, git_branch, model, token_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, name, opts.gitRepo, opts.gitBranch, opts.model, now, now);
  db.close();
  return id;
}

export function saveSession(
  sessionId: string,
  agentHistory: ChatMessage[],
  tokenCount: number,
  model: string,
): void {
  const db = openDb();
  const now = Date.now();

  db.prepare("DELETE FROM session_messages WHERE session_id = ?").run(sessionId);

  const insert = db.prepare(
    `INSERT INTO session_messages (session_id, idx, role, content, tool_calls, tool_call_id, msg_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const truncated = truncateAgentHistory(agentHistory);
  for (let i = 0; i < truncated.length; i++) {
    const m = truncated[i]!;
    insert.run(
      sessionId, i,
      m.role, m.content,
      m.toolCalls ? JSON.stringify(m.toolCalls) : null,
      m.toolCallId ?? null,
      m.name ?? null,
    );
  }

  db.prepare(
    `UPDATE sessions SET updated_at = ?, token_count = ?, model = ? WHERE id = ?`,
  ).run(now, tokenCount, model, sessionId);
  db.close();
}

export function loadSession(sessionId: string): {
  session: SessionMeta;
  agentHistory: ChatMessage[];
  uiMessages: Message[];
} | null {
  const db = openDb();

  const row = db.prepare(
    `SELECT s.*, COUNT(sm.id) as message_count
     FROM sessions s
     LEFT JOIN session_messages sm ON sm.session_id = s.id
     WHERE s.id = ?
     GROUP BY s.id`,
  ).get(sessionId) as Record<string, unknown> | undefined;

  if (!row) { db.close(); return null; }

  const rows = db.prepare(
    `SELECT * FROM session_messages WHERE session_id = ? ORDER BY idx`,
  ).all(sessionId) as Record<string, unknown>[];

  db.close();

  const agentHistory: ChatMessage[] = rows.map((r) => ({
    role: r.role as ChatMessage["role"],
    content: String(r.content),
    ...(r.tool_calls ? { toolCalls: JSON.parse(String(r.tool_calls)) } : {}),
    ...(r.tool_call_id ? { toolCallId: String(r.tool_call_id) } : {}),
    ...(r.msg_name ? { name: String(r.msg_name) } : {}),
  }));

  return {
    session: {
      id: String(row.id),
      name: String(row.name),
      gitRepo: String(row.git_repo),
      gitBranch: String(row.git_branch),
      model: String(row.model),
      tokenCount: Number(row.token_count),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      messageCount: Number(row.message_count),
    },
    agentHistory,
    uiMessages: agentHistoryToUiMessages(agentHistory),
  };
}

export function findLastSession(gitRepo: string, gitBranch: string): SessionMeta | null {
  const db = openDb();
  const row = db.prepare(
    `SELECT s.*, COUNT(sm.id) as message_count
     FROM sessions s
     LEFT JOIN session_messages sm ON sm.session_id = s.id
     WHERE s.git_repo = ? AND s.git_branch = ?
     GROUP BY s.id
     ORDER BY s.updated_at DESC LIMIT 1`,
  ).get(gitRepo, gitBranch) as Record<string, unknown> | undefined;
  db.close();
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    gitRepo: String(row.git_repo),
    gitBranch: String(row.git_branch),
    model: String(row.model),
    tokenCount: Number(row.token_count),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    messageCount: Number(row.message_count),
  };
}

export function listSessions(limit = 10): SessionMeta[] {
  const db = openDb();
  const rows = db.prepare(
    `SELECT s.*, COUNT(sm.id) as message_count
     FROM sessions s
     LEFT JOIN session_messages sm ON sm.session_id = s.id
     GROUP BY s.id
     ORDER BY s.updated_at DESC LIMIT ?`,
  ).all(limit) as Record<string, unknown>[];
  db.close();
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    gitRepo: String(r.git_repo),
    gitBranch: String(r.git_branch),
    model: String(r.model),
    tokenCount: Number(r.token_count),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    messageCount: Number(r.message_count),
  }));
}

export function deleteSession(sessionId: string): void {
  const db = openDb();
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  db.close();
}
