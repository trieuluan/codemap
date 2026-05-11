import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { AgentTool, AgentToolCallResult } from "./mcp-tool-client.js";
import { readWorkspacePath } from "../../../lib/workspace-project.js";

export interface McpServerEntryConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

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

    const response = await this.client!.listTools();
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

  async listResources(): Promise<{ uri: string; name: string }[]> {
    await this.ensureConnected();
    if (this._resources) return this._resources;
    const response = await this.client!.listResources();
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
    await this.transport?.close();
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
      if (process.env.CODEMAP_DEBUG_AGENT_TOOLS === "1") {
        process.stderr.write(String(chunk));
      }
    });
    await this.client.connect(this.transport);
  }
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
