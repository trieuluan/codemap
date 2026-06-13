import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { AgentTool, AgentToolCallResult } from "./mcp-types.ts";
import { readWorkspacePath } from "@codemap-ai/core/lib/workspace-project.js";

export interface McpServerEntryConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// ── MCP debug logger ──────────────────────────────────────────────

function findGitRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const MCP_LOG_FILE = join(
  findGitRoot(),
  ".codemap",
  "debug-logs",
  "mcp-connections.jsonl",
);

function mcpLog(entry: Record<string, unknown>) {
  const logDir = dirname(MCP_LOG_FILE);
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  appendFileSync(
    MCP_LOG_FILE,
    JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n",
  );
}

// ── McpServerConnection ───────────────────────────────────────────

export class McpServerConnection {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private _tools: AgentTool[] | null = null;
  private _resources: { uri: string; name: string }[] | null = null;

  constructor(private name: string, private config: McpServerEntryConfig) {}

  async connect(): Promise<void> {
    await this.ensureConnected();
  }

  get tools(): AgentTool[] | null {
    return this._tools;
  }

  get resources(): { uri: string; name: string }[] | null {
    return this._resources;
  }

  async listTools(): Promise<AgentTool[]> {
    await this.ensureConnected();
    if (this._tools) return this._tools;

    const response = await this.client!.listTools(undefined, { timeout: 120_000 });
    this._tools = response.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    return this._tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const start = Date.now();
    return this.withReconnect(() => this.callToolRaw(name, args))
      .then((result) => {
        mcpLog({
          event: "callTool",
          server: this.name,
          tool: name,
          durationMs: Date.now() - start,
          ok: true,
          isError: result.isError ?? false,
          resultLen: result.content.length,
        });
        return result;
      })
      .catch((err) => {
        mcpLog({
          event: "callTool",
          server: this.name,
          tool: name,
          durationMs: Date.now() - start,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      });
  }

  async listResources(): Promise<{ uri: string; name: string }[]> {
    await this.ensureConnected();
    if (this._resources) return this._resources;
    const response = await this.client!.listResources(undefined, { timeout: 120_000 });
    this._resources = response.resources.map((r) => ({ uri: r.uri, name: r.name }));
    return this._resources;
  }

  async readResource(uri: string): Promise<string> {
    await this.ensureConnected();
    const response = await this.client!.readResource({ uri });
    return response.contents
      .filter(
        (c): c is { uri: string; text: string; mimeType?: string } =>
          "text" in c,
      )
      .map((c) => c.text)
      .join("\n");
  }

  async close(): Promise<void> {
    mcpLog({ event: "close", server: this.name });
    await this.transport?.close();
    this.transport = null;
    this.client = null;
    this._tools = null;
    this._resources = null;
  }

  private async callToolRaw(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const result = await this.client!.callTool(
      { name, arguments: args },
      undefined,
      { timeout: 300_000 }, // 5 min — large file reads can be slow
    );

    if ("toolResult" in result) {
      return { content: stringifyToolResult(result.toolResult) };
    }

    return {
      content: formatMcpContent(result.content),
      structuredContent: result.structuredContent,
      isError: result.isError,
    };
  }

  private async withReconnect<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureConnected();
    try {
      return await fn();
    } catch (err) {
      if (!isConnectionClosed(err)) throw err;
      mcpLog({
        event: "connection_closed",
        server: this.name,
        error: err instanceof Error ? err.message : String(err),
      });
      this.resetConnection();
      await this.ensureConnected();
      mcpLog({ event: "reconnected", server: this.name });
      return await fn();
    }
  }

  private resetConnection(): void {
    this.transport?.close().catch(() => {});
    this.transport = null;
    this.client = null;
    this._tools = null;
    this._resources = null;
  }

  private async ensureConnected() {
    if (this.client) return;

    const workspacePath = await readWorkspacePath();
    const env: Record<string, string> = {
      ...process.env,
      ...this.config.env,
    } as Record<string, string>;

    mcpLog({
      event: "connect",
      server: this.name,
      command: this.config.command,
      args: this.config.args,
      cwd: workspacePath,
    });

    this.client = new Client(
      { name: `codemap-chat-${this.name}`, version: "1.0.0" },
      { capabilities: {} },
    );
    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args ?? [],
      cwd: workspacePath,
      env,
      stderr: "pipe",
    });
    this.transport.stderr?.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) {
        mcpLog({ event: "stderr", server: this.name, text });
      }
      if (process.env.CODEMAP_DEBUG_AGENT_TOOLS === "1") {
        process.stderr.write(String(chunk));
      }
    });
    await this.client.connect(this.transport);

    mcpLog({ event: "connected", server: this.name });
  }
}

function isConnectionClosed(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("connection closed") ||
    msg.includes("connection lost") ||
    msg.includes("not connected")
  );
}

function formatMcpContent(
  content: Array<
    | { type: "text"; text: string }
    | { type: string; [key: string]: unknown }
  >,
) {
  if (content.length === 0) return "";
  return content
    .map((item) => {
      if (item.type === "text") return item.text;
      return stringifyToolResult(item);
    })
    .join("\n");
}

function stringifyToolResult(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
