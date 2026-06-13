import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MCPClient } from "@mastra/mcp";

import {
  readMcpServerConfigs,
  readPriorityResources,
} from "@codemap-ai/core/lib/workspace-project.js";
import type { ChatToolDefinition } from "@codemap-ai/core/agent";
import type { AgentTool, AgentToolCallResult, McpServerStatus } from "./mcp-types.ts";

// Re-export types so existing consumers don't need to change imports
export type { AgentTool, AgentToolCallResult, McpServerStatus } from "./mcp-types.ts";

type ExtraServerConfig = { command: string; args?: string[]; env?: Record<string, string> };

const require = createRequire(import.meta.url);

const DEFAULT_PRIORITY_RESOURCES = [
  "codemap://project/context",
  "codemap://rules/agent-workflow",
];

export class CodeMapMcpToolClient {
  private _mcpClient: MCPClient;
  private _extraConfigs: Map<string, ExtraServerConfig> = new Map();
  private _serverConfig: { command: string; args: string[]; env: Record<string, string> };
  private _cachedToolCount = 0;

  constructor() {
    const runtime = resolvePackageRuntime();
    const codemapServer = resolveServerCommand(runtime);
    this._serverConfig = {
      command: codemapServer.command,
      args: codemapServer.args,
      env: { CODEMAP_TOOL_MODE: "full" },
    };
    this._mcpClient = new MCPClient({
      id: "codemap-chat-client",
      servers: {
        codemap: {
          command: codemapServer.command,
          args: codemapServer.args,
          env: { ...process.env as Record<string, string>, CODEMAP_TOOL_MODE: "full" },
          stderr: "pipe",
        },
      },
    });
  }

  getServerConfig(): { command: string; args: string[]; env: Record<string, string> } {
    return this._serverConfig;
  }

  getExtraServerConfigs(): Record<string, ExtraServerConfig> {
    return Object.fromEntries(this._extraConfigs);
  }

  async connectExtras(
    globalMcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>,
  ): Promise<void> {
    const configs = await readMcpServerConfigs(process.cwd(), globalMcpServers);
    for (const [name, config] of configs) {
      this._extraConfigs.set(name, config);
    }
  }

  addExtraServer(name: string, config: ExtraServerConfig): void {
    this._extraConfigs.set(name, config);
  }

  removeExtraServer(name: string): boolean {
    return this._extraConfigs.delete(name);
  }

  getServerStatuses(): McpServerStatus[] {
    const statuses: McpServerStatus[] = [
      { name: "codemap", connected: this._cachedToolCount > 0, tools: this._cachedToolCount },
    ];
    for (const [name] of this._extraConfigs) {
      statuses.push({ name, connected: true, tools: 0 });
    }
    return statuses;
  }

  async listAllowedTools(): Promise<AgentTool[]> {
    const toolsets = await this._mcpClient.listToolsets();
    const tools = toolsets["codemap"] ?? {};
    return Object.entries(tools).map(([name, tool]) => ({
      name,
      description: (tool as { description?: string }).description ?? "",
      inputSchema: ((tool as { inputSchema?: unknown }).inputSchema ?? {}) as Record<string, unknown>,
    })) as AgentTool[];
  }

  async listChatTools(): Promise<ChatToolDefinition[]> {
    const toolsets = await this._mcpClient.listToolsets();
    const tools = toolsets["codemap"] ?? {};
    return Object.entries(tools).map(([name, tool]) => ({
      type: "function" as const,
      function: {
        name,
        description: (tool as { description?: string }).description ?? "",
        parameters: ((tool as { inputSchema?: unknown }).inputSchema ?? {}) as Record<string, unknown>,
      },
    }));
  }

  /** Returns Mastra tool definitions for sharing with the harness (avoids a second child process).
   * Keys are prefixed with the server name (e.g. "codemap_explore_task") so that
   * formatToolDisplayName can strip the prefix and show "codemap · explore_task" in the UI.
   */
  async getMastraTools(): Promise<Record<string, unknown>> {
    const toolsets = await this._mcpClient.listToolsets();
    const prefixed: Record<string, unknown> = {};
    for (const [serverName, serverTools] of Object.entries(toolsets)) {
      for (const [toolName, tool] of Object.entries(serverTools as Record<string, unknown>)) {
        prefixed[`${serverName}_${toolName}`] = tool;
      }
    }
    this._cachedToolCount = Object.keys(toolsets["codemap"] ?? {}).length;
    return prefixed;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const toolsets = await this._mcpClient.listToolsets();
    const tool = (toolsets["codemap"] ?? {})[name] as
      | { execute?: (args: Record<string, unknown>, ctx?: unknown) => Promise<unknown> }
      | undefined;
    if (!tool?.execute) {
      throw new Error(`MCP tool not found: ${name}`);
    }
    const raw = await tool.execute(args, undefined);
    return formatToolResult(raw);
  }

  async listResources(): Promise<{ uri: string; name: string }[]> {
    const allResources = await this._mcpClient.resources.list();
    return (allResources["codemap"] ?? []).map((r) => ({
      uri: r.uri,
      name: r.name ?? r.uri,
    }));
  }

  async readResource(uri: string): Promise<string> {
    const result = await this._mcpClient.resources.read("codemap", uri);
    return result.contents
      .filter((c): c is { uri: string; text: string } => "text" in c)
      .map((c) => c.text)
      .join("\n");
  }

  /** Disconnect the current MCP server and spawn a fresh one that re-reads
   *  config from disk (e.g. after login updates ~/.codemap/settings.json). */
  async reconnect(): Promise<void> {
    await this._mcpClient.disconnect().catch(() => {});
    this._cachedToolCount = 0;
    this._mcpClient = new MCPClient({
      id: "codemap-chat-client",
      servers: {
        codemap: {
          command: this._serverConfig.command,
          args: this._serverConfig.args,
          env: { ...process.env as Record<string, string>, CODEMAP_TOOL_MODE: "full" },
          stderr: "pipe",
        },
      },
    });
  }

  async close(): Promise<void> {
    await this._mcpClient.disconnect();
  }
}

export async function fetchResourceContext(
  toolClient: CodeMapMcpToolClient,
): Promise<string | null> {
  const configured = await readPriorityResources();
  const priorityUris =
    configured.length > 0 ? configured : DEFAULT_PRIORITY_RESOURCES;

  const resources = await toolClient.listResources();
  const toFetch = priorityUris.filter((uri) =>
    resources.some((r) => r.uri === uri),
  );
  if (toFetch.length === 0) return null;

  const parts: string[] = [];
  for (const uri of toFetch) {
    try {
      const text = await toolClient.readResource(uri);
      if (text) parts.push(text);
    } catch {
      /* skip failed resource */
    }
  }
  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

function formatToolResult(raw: unknown): AgentToolCallResult {
  if (raw === null || raw === undefined) return { content: "" };

  if (typeof raw === "object" && raw !== null && "content" in raw) {
    const result = raw as {
      content: Array<{ type: string; text?: string }>;
      structuredContent?: unknown;
      isError?: boolean;
    };
    if (Array.isArray(result.content)) {
      const text = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
      return {
        content: text,
        structuredContent: result.structuredContent as Record<string, unknown> | undefined,
        isError: result.isError,
      };
    }
  }

  // execute() returned structuredContent directly (Mastra SDK strips the MCP
  // content array when structuredContent is present). Prefer the human-readable
  // summary field; fall back to JSON only for the data portion.
  if (typeof raw === "object" && raw !== null && "summary" in raw) {
    const structured = raw as Record<string, unknown>;
    const summary = String(structured.summary ?? "");
    return { content: summary, structuredContent: structured };
  }

  return {
    content: typeof raw === "string" ? raw : JSON.stringify(raw, null, 2),
    structuredContent: raw as Record<string, unknown>,
  };
}

function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function resolvePackageRuntime() {
  const currentFile = fileURLToPath(import.meta.url);
  const packageRoot = findPackageRoot(path.dirname(currentFile));
  return {
    packageRoot,
    isSourceRuntime: currentFile.includes(`${path.sep}src${path.sep}`),
  };
}

function resolveServerCommand(runtime: {
  packageRoot: string;
  isSourceRuntime: boolean;
}): {
  command: string;
  args: string[];
} {
  const { packageRoot, isSourceRuntime } = runtime;

  // In source/dev runtime: prefer mcp/src via tsx from monorepo sibling layout
  if (isSourceRuntime) {
    const mcpSrcEntry = path.join(
      path.dirname(packageRoot),
      "mcp",
      "src",
      "index.ts",
    );
    if (existsSync(mcpSrcEntry)) {
      return {
        command: process.execPath,
        args: [require.resolve("tsx/cli"), mcpSrcEntry],
      };
    }
  }

  // Try @codemap-ai/mcp package (production dep or workspace symlink → dist/index.js)
  try {
    const mcpEntry = require.resolve("@codemap-ai/mcp");
    return { command: process.execPath, args: [mcpEntry] };
  } catch {
    // Fallback: sibling mcp/dist in monorepo
    const mcpDistEntry = path.join(
      path.dirname(packageRoot),
      "mcp",
      "dist",
      "index.js",
    );
    if (existsSync(mcpDistEntry)) {
      return { command: process.execPath, args: [mcpDistEntry] };
    }
  }

  throw new Error(
    "Cannot locate CodeMap MCP server. Ensure @codemap-ai/mcp is installed.",
  );
}
