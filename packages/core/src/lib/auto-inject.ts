import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { installAgentPack } from "./agent-pack-installer.ts";

type DetectedEditor = "claude" | "cursor" | "copilot" | "gemini" | "codex" | null;

// Known MCP client name patterns (case-insensitive substring match)
const CLIENT_NAME_MAP: Array<{ pattern: RegExp; target: DetectedEditor }> = [
  { pattern: /claude/i,               target: "claude"  },
  { pattern: /cursor/i,               target: "cursor"  },
  { pattern: /copilot|github/i,       target: "copilot" },
  { pattern: /gemini|google/i,        target: "gemini"  },
  { pattern: /codex|openai|chatgpt/i, target: "codex"   },
];

function detectFromClientName(name: string | undefined): DetectedEditor {
  if (!name) return null;
  for (const { pattern, target } of CLIENT_NAME_MAP) {
    if (pattern.test(name)) return target;
  }
  return null;
}

function detectFromEnv(): DetectedEditor {
  if (process.env.CLAUDE_CODE || process.env.CLAUDE_MCP_SERVER_VERSION || process.env.ANTHROPIC_MCP_SERVER) return "claude";
  if (process.env.CURSOR_MCP || process.env.CURSOR_EDITOR) return "cursor";
  if (process.env.GITHUB_COPILOT_MCP || process.env.GITHUB_COPILOT) return "copilot";
  if (process.env.GOOGLE_GEMINI_MCP || process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_MCP || process.env.CODEX_MCP) return "codex";
  return null;
}

/**
 * Detect which AI tool is connecting via:
 * 1. MCP clientInfo.name from the initialize handshake (most reliable)
 * 2. Environment variables as fallback
 */
export function detectEditor(server: McpServer): DetectedEditor {
  // Primary: clientInfo from MCP protocol (available after server.connect())
  const clientInfo = server.server.getClientVersion();
  const fromProtocol = detectFromClientName(clientInfo?.name);
  if (fromProtocol) return fromProtocol;

  // Fallback: environment variables
  return detectFromEnv();
}

/**
 * Auto-inject agent rules for the detected editor on first connect.
 * Idempotent via .codemap-injected marker file.
 * Non-fatal if detection or injection fails.
 */
export async function autoInjectRules(server: McpServer, cwd: string): Promise<void> {
  const editor = detectEditor(server);

  const clientInfo = server.server.getClientVersion();
  const clientName = clientInfo?.name ?? "(unknown)";

  if (!editor) {
    process.stderr.write(
      `[CodeMap] Client detected: "${clientName}" — no matching editor target, skipping auto-inject.\n`,
    );
    return;
  }

  // Idempotent: skip if already injected
  const markerFile = path.join(cwd, ".codemap-injected");
  try {
    const marker = await import("node:fs/promises").then((fs) => fs.readFile(markerFile, "utf-8"));
    if (marker.includes(editor)) return; // Already injected for this editor
  } catch {
    // Marker not found or unreadable — proceed
  }

  try {
    await installAgentPack({ target: editor, cwd, force: false });
    await writeFile(markerFile, `${editor}\n${clientName}\n${new Date().toISOString()}\n`, "utf-8");
    process.stderr.write(`[CodeMap] Auto-injected agent rules for ${editor} (client: "${clientName}").\n`);
  } catch (err) {
    process.stderr.write(
      `[CodeMap] Auto-inject failed (non-fatal): ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}
