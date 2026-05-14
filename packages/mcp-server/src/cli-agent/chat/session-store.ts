import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../types.js";
import type { Message } from "./ui/store.js";

const DB_DIR = path.join(homedir(), ".codemap");
const DB_PATH = path.join(DB_DIR, "sessions.db");

const UI_MSG_TRUNCATE = 500;
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
  mkdirSync(DB_DIR, { recursive: true });
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
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      idx         INTEGER NOT NULL,
      is_ui       INTEGER NOT NULL DEFAULT 0,
      role        TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      tool_calls  TEXT,
      tool_call_id TEXT,
      msg_name    TEXT,
      tool_name   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_session_messages_session
      ON session_messages(session_id, is_ui, idx);
  `);
  return db;
}

// ─── Truncation helpers ───────────────────────────────────

function truncateAgentHistory(history: ChatMessage[]): ChatMessage[] {
  return history.map((msg) => {
    if (msg.role === "tool" && msg.content.length > TOOL_RESULT_TRUNCATE) {
      return { ...msg, content: msg.content.slice(0, TOOL_RESULT_TRUNCATE) + "\n[truncated]" };
    }
    return msg;
  });
}

function truncateUiMessages(messages: Message[]): Message[] {
  return messages.map((msg) => {
    if (msg.role === "welcome") return msg;
    if (msg.content.length > UI_MSG_TRUNCATE) {
      return { ...msg, content: msg.content.slice(0, UI_MSG_TRUNCATE) + "…" };
    }
    return msg;
  });
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
  uiMessages: Message[],
  tokenCount: number,
  model: string,
): void {
  const db = openDb();
  const now = Date.now();

  // Delete existing messages and re-insert (replace strategy)
  db.prepare("DELETE FROM session_messages WHERE session_id = ?").run(sessionId);

  const insertMsg = db.prepare(
    `INSERT INTO session_messages
       (session_id, idx, is_ui, role, content, tool_calls, tool_call_id, msg_name, tool_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const truncatedHistory = truncateAgentHistory(agentHistory);
  for (let i = 0; i < truncatedHistory.length; i++) {
    const m = truncatedHistory[i]!;
    insertMsg.run(
      sessionId, i, 0,
      m.role, m.content,
      m.toolCalls ? JSON.stringify(m.toolCalls) : null,
      m.toolCallId ?? null,
      m.name ?? null,
      null,
    );
  }

  const truncatedUi = truncateUiMessages(uiMessages.filter((m) => m.role !== "welcome"));
  for (let i = 0; i < truncatedUi.length; i++) {
    const m = truncatedUi[i]!;
    insertMsg.run(
      sessionId, i, 1,
      m.role, m.content,
      m.toolCalls ? JSON.stringify(m.toolCalls) : null,
      null, null,
      m.toolName ?? null,
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
     LEFT JOIN session_messages sm ON sm.session_id = s.id AND sm.is_ui = 0
     WHERE s.id = ?
     GROUP BY s.id`,
  ).get(sessionId) as (Record<string, unknown>) | undefined;

  if (!row) { db.close(); return null; }

  const agentRows = db.prepare(
    `SELECT * FROM session_messages WHERE session_id = ? AND is_ui = 0 ORDER BY idx`,
  ).all(sessionId) as Record<string, unknown>[];

  const uiRows = db.prepare(
    `SELECT * FROM session_messages WHERE session_id = ? AND is_ui = 1 ORDER BY idx`,
  ).all(sessionId) as Record<string, unknown>[];

  db.close();

  const agentHistory: ChatMessage[] = agentRows.map((r) => ({
    role: r.role as ChatMessage["role"],
    content: String(r.content),
    ...(r.tool_calls ? { toolCalls: JSON.parse(String(r.tool_calls)) } : {}),
    ...(r.tool_call_id ? { toolCallId: String(r.tool_call_id) } : {}),
    ...(r.msg_name ? { name: String(r.msg_name) } : {}),
  }));

  const uiMessages: Message[] = uiRows.map((r) => ({
    role: r.role as Message["role"],
    content: String(r.content),
    ...(r.tool_name ? { toolName: String(r.tool_name) } : {}),
    ...(r.tool_calls ? { toolCalls: JSON.parse(String(r.tool_calls)) } : {}),
    timestamp: undefined,
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
    uiMessages,
  };
}

export function findLastSession(gitRepo: string, gitBranch: string): SessionMeta | null {
  const db = openDb();
  const row = db.prepare(
    `SELECT s.*, COUNT(sm.id) as message_count
     FROM sessions s
     LEFT JOIN session_messages sm ON sm.session_id = s.id AND sm.is_ui = 0
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
     LEFT JOIN session_messages sm ON sm.session_id = s.id AND sm.is_ui = 0
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
