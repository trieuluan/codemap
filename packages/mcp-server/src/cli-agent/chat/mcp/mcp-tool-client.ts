import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readMcpServerConfigs,
  readPriorityResources,
} from "../../../lib/workspace-project.js";
import type { ChatToolDefinition } from "../../types.js";
import { McpServerConnection } from "./mcp-server-connection.js";

const require = createRequire(import.meta.url);

const CONFIRM_PATTERNS =
  /(^|_)(patch|edit|write|delete|remove|rename|move|create|update|insert|drop|truncate)/i;

export function isConfirmTool(name: string): boolean {
  return CONFIRM_PATTERNS.test(name);
}

export interface AgentTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentToolCallResult {
  content: string;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpServerStatus {
  name: string;
  connected: boolean;
  tools: number;
  error?: string;
}

const DEFAULT_PRIORITY_RESOURCES = [
  "codemap://project/context",
  "codemap://rules/agent-workflow",
];

export class CodeMapMcpToolClient {
  private defaultConn: McpServerConnection;
  private extraConns: Map<string, McpServerConnection> = new Map();
  private connectionErrors: Map<string, string> = new Map();

  constructor() {
    const runtime = resolvePackageRuntime();
    const codemapServer = resolveServerCommand(runtime);
    this.defaultConn = new McpServerConnection("codemap", {
      command: codemapServer.command,
      args: codemapServer.args,
      env: { CODEMAP_TOOL_MODE: "full" },
    });
  }

  async connectExtras(): Promise<void> {
    const configs = await readMcpServerConfigs();
    for (const [name, config] of configs) {
      try {
        const conn = new McpServerConnection(name, config);
        await conn.connect();
        this.extraConns.set(name, conn);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.connectionErrors.set(name, msg);
      }
    }
    // List tools for extra connections to populate caches
    for (const [name, conn] of this.extraConns) {
      try {
        await conn.listTools();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.connectionErrors.set(name, msg);
        this.extraConns.delete(name);
      }
    }
    // List resources for extra connections
    for (const conn of this.extraConns.values()) {
      try {
        await conn.listResources();
      } catch {
        // non-blocking
      }
    }
  }

  getServerStatuses(): McpServerStatus[] {
    const statuses: McpServerStatus[] = [
      { name: "codemap", connected: true, tools: this.defaultConn.tools?.length ?? 0 },
    ];
    for (const [name, conn] of this.extraConns) {
      statuses.push({ name, connected: true, tools: conn.tools?.length ?? 0 });
    }
    for (const [name, error] of this.connectionErrors) {
      statuses.push({ name, connected: false, tools: 0, error });
    }
    return statuses;
  }

  async listAllowedTools(): Promise<AgentTool[]> {
    const defaultTools = await this.defaultConn.listTools();
    return [...defaultTools, ...this.listExtraTools().map((t) => t.tool)];
  }

  async listChatTools(): Promise<ChatToolDefinition[]> {
    const defaultTools = await this.defaultConn.listTools();
    const result: ChatToolDefinition[] = defaultTools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    for (const { serverName, tool } of this.listExtraTools()) {
      result.push({
        type: "function" as const,
        function: {
          name: `${serverName}__${tool.name}`,
          description: `[${serverName}] ${tool.description}`,
          parameters: tool.inputSchema,
        },
      });
    }

    return result;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const sep = name.indexOf("__");
    if (sep > 0) {
      const serverName = name.slice(0, sep);
      const toolName = name.slice(sep + 2);
      const conn = this.extraConns.get(serverName);
      if (conn) {
        return conn.callTool(toolName, args);
      }
    }
    return this.defaultConn.callTool(name, args);
  }

  async listResources(): Promise<{ uri: string; name: string }[]> {
    const defaultResources = await this.defaultConn.listResources();
    return [...defaultResources, ...this.listExtraResources()];
  }

  async readResource(uri: string): Promise<string> {
    // Try default first
    const defaultResources = await this.defaultConn.listResources();
    if (defaultResources.some((r) => r.uri === uri)) {
      return this.defaultConn.readResource(uri);
    }
    // Try extra servers
    for (const conn of this.extraConns.values()) {
      try {
        const resources = await conn.listResources();
        if (resources.some((r) => r.uri === uri)) {
          return conn.readResource(uri);
        }
      } catch {
        // skip
      }
    }
    return this.defaultConn.readResource(uri);
  }

  async close(): Promise<void> {
    await this.defaultConn.close();
    for (const conn of this.extraConns.values()) {
      await conn.close();
    }
    this.extraConns.clear();
    this.connectionErrors.clear();
  }

  private listExtraTools(): {
    serverName: string;
    tool: AgentTool;
  }[] {
    const result: { serverName: string; tool: AgentTool }[] = [];
    for (const [name, conn] of this.extraConns) {
      const tools = conn.tools;
      if (tools) {
        for (const tool of tools) {
          result.push({ serverName: name, tool });
        }
      }
    }
    return result;
  }

  private listExtraResources(): { uri: string; name: string }[] {
    const result: { uri: string; name: string }[] = [];
    for (const conn of this.extraConns.values()) {
      const resources = conn.resources;
      if (resources) result.push(...resources);
    }
    return result;
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
  if (isSourceRuntime) {
    return {
      command: process.execPath,
      args: [
        require.resolve("tsx/cli"),
        path.join(packageRoot, "src", "index.ts"),
      ],
    };
  }

  const distEntry = path.join(packageRoot, "dist", "index.js");
  if (existsSync(distEntry)) {
    return { command: process.execPath, args: [distEntry] };
  }

  return {
    command: process.execPath,
    args: [
      require.resolve("tsx/cli"),
      path.join(packageRoot, "src", "index.ts"),
    ],
  };
}
