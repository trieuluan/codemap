import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { readWorkspacePath } from "../../lib/workspace-project.js";
import type { ChatToolDefinition } from "../types.js";

const require = createRequire(import.meta.url);

export const AUTO_TOOL_NAMES = new Set([
  "get_agent_workflow",
  "recommend_agent_workflow",
  "get_project",
  "search_codebase",
  "get_file",
  "get_files",
  "find_related_files",
  "find_usages",
  "find_callers",
  "get_working_diff",
  "refresh_local_index",
]);

export const CONFIRM_TOOL_NAMES = new Set(["apply_patch"]);

export type AgentToolName =
  | (typeof AUTO_TOOL_NAMES extends Set<infer T> ? T : never)
  | "apply_patch";

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

export class CodeMapMcpToolClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: AgentTool[] | null = null;

  async listAllowedTools(): Promise<AgentTool[]> {
    await this.ensureConnected();
    if (this.tools) return this.tools;

    const response = await this.client!.listTools();
    this.tools = response.tools
      .filter(
        (tool) =>
          AUTO_TOOL_NAMES.has(tool.name) || CONFIRM_TOOL_NAMES.has(tool.name),
      )
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    return this.tools;
  }

  async listChatTools(): Promise<ChatToolDefinition[]> {
    const tools = await this.listAllowedTools();
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
    if (!AUTO_TOOL_NAMES.has(name) && !CONFIRM_TOOL_NAMES.has(name)) {
      return {
        content: `Tool "${name}" is not allowed in CodeMap chat agent mode.`,
        isError: true,
      };
    }

    await this.ensureConnected();
    const result = await this.client!.callTool({
      name,
      arguments: args,
    });

    if ("toolResult" in result) {
      return { content: stringifyToolResult(result.toolResult) };
    }

    return {
      content: formatMcpContent(result.content),
      structuredContent: result.structuredContent,
      isError: result.isError,
    };
  }

  async close(): Promise<void> {
    await this.transport?.close();
    this.transport = null;
    this.client = null;
    this.tools = null;
  }

  private async ensureConnected() {
    if (this.client) return;

    const runtime = resolvePackageRuntime();
    const workspacePath = await readWorkspacePath();
    const server = resolveServerCommand(runtime);
    const env: Record<string, string> = {
      ...process.env,
      CODEMAP_TOOL_MODE: "full",
    } as Record<string, string>;

    this.client = new Client(
      { name: "codemap-chat-agent", version: "1.0.0" },
      { capabilities: {} },
    );
    this.transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: workspacePath,
      env,
      stderr: "pipe",
    });
    this.transport.stderr?.on("data", (chunk) => {
      if (process.env.CODEMAP_DEBUG_AGENT_TOOLS === "1") {
        process.stderr.write(String(chunk));
      }
    });
    await this.client.connect(this.transport);
  }
}

function resolvePackageRuntime() {
  const currentFile = fileURLToPath(import.meta.url);
  return {
    packageRoot: path.resolve(path.dirname(currentFile), "../../.."),
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
