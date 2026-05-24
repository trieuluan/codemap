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

type ExtraServerConfig = { command: string; args?: string[]; env?: Record<string, string> };

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
  private _extraConfigs: Map<string, ExtraServerConfig> = new Map();
  private _serverConfig: { command: string; args: string[]; env: Record<string, string> };

  constructor() {
    const runtime = resolvePackageRuntime();
    const codemapServer = resolveServerCommand(runtime);
    this._serverConfig = {
      command: codemapServer.command,
      args: codemapServer.args,
      env: { CODEMAP_TOOL_MODE: "full" },
    };
    this.defaultConn = new McpServerConnection("codemap", this._serverConfig);
  }

  getServerConfig(): { command: string; args: string[]; env: Record<string, string> } {
    return this._serverConfig;
  }

  getExtraServerConfigs(): Record<string, ExtraServerConfig> {
    return Object.fromEntries(this._extraConfigs);
  }

  async connectExtras(): Promise<void> {
    const configs = await readMcpServerConfigs();
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
      { name: "codemap", connected: true, tools: this.defaultConn.tools?.length ?? 0 },
    ];
    for (const [name] of this._extraConfigs) {
      statuses.push({ name, connected: true, tools: 0 });
    }
    return statuses;
  }

  async listAllowedTools(): Promise<AgentTool[]> {
    return this.defaultConn.listTools();
  }

  async listChatTools(): Promise<ChatToolDefinition[]> {
    const tools = await this.defaultConn.listTools();
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    return this.defaultConn.callTool(name, args);
  }

  async listResources(): Promise<{ uri: string; name: string }[]> {
    return this.defaultConn.listResources();
  }

  async readResource(uri: string): Promise<string> {
    return this.defaultConn.readResource(uri);
  }

  async close(): Promise<void> {
    await this.defaultConn.close();
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
