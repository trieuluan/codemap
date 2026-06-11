/**
 * Headless runner — non-interactive single-prompt execution.
 *
 * Usage:
 *   codemap --prompt "Fix the bug in auth.ts" --format json --timeout 60
 *
 * Exit codes:
 *   0 = success
 *   1 = error or aborted
 *   2 = timeout
 */

import { CodeMapMcpToolClient } from "../../agent/tools/mcp/mcp-tool-client.js";
import { NineRouterProvider } from "../../agent/loop/provider.js";
import { resetHarnessSingleton } from "../../agent/runtime/harness-runtime.js";
import { getMastraCurrentModelId } from "../../agent/runtime/harness-runtime.js";

import { resolveGatewayModel } from "../../agent/runtime/config/models.js";
import { runSingleAgentRuntime } from "../../agent/runtime/cli-runtime.js";
import { buildCodeMapAgentInstructions } from "../../chat/terminal/config/agent-instructions.js";
import {
  createSessionContextCache,
  getSessionResourceContext,
  getSessionProjectContext,
} from "../../chat/terminal/lifecycle/session-context.js";
import { loadGatewayConfig } from "../config.js";
import { loadConfig } from "@codemap-ai/core/config.js";
import type { ChatMessage, TokenUsage } from "../../agent/types.js";

export interface HeadlessOptions {
  prompt: string;
  format?: "text" | "json";
  timeout?: number; // seconds
  model?: string;
  mode?: "build" | "plan" | "fast";
}

interface HeadlessResult {
  text: string;
  usedTools: boolean;
  unsupportedToolCalling: boolean;
  duration: number;
  model?: string;
  messages?: ChatMessage[];
  toolCalls?: ToolCallSummary[];
  usage?: TokenUsage;
  filesChanged?: string[];
  error?: string;
}

interface ToolCallSummary {
  name: string;
  args: string;
  success?: boolean;
}

export async function runHeadless(opts: HeadlessOptions): Promise<void> {
  const startTime = Date.now();
  const timeoutMs = (opts.timeout ?? 300) * 1000;

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  let toolClient: CodeMapMcpToolClient | null = null;

  // Suppress stderr in headless mode — MCP connection errors, transport
  // warnings, and library debug logs would otherwise pollute the terminal.
  // Restore stderr in `finally` so cleanup errors are still visible.
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  try {
    process.stderr.write = (() => true) as any;

    // 1. Load gateway config
    const gwConfig = await loadGatewayConfig();
    if (!gwConfig.apiKey) {
      const result: HeadlessResult = {
        text: "",
        usedTools: false,
        unsupportedToolCalling: false,
        duration: 0,
        error: "No API key configured. Run `codemap` to set up.",
      };
      process.stdout.write(formatOutput(result, opts.format ?? "text") + "\n");
      process.exit(1);
    }

    // 2. Create provider
    const provider = new NineRouterProvider(gwConfig.baseUrl, gwConfig.apiKey);

    // 3. Resolve model
    const model = opts.model ?? gwConfig.defaultModel;

    // 4. Create MCP tool client (spawns codemap-mcp child process)
    toolClient = new CodeMapMcpToolClient();

    // Connect extra MCP servers if configured
    const mcpConfig = await loadConfig();
    await toolClient.connectExtras(mcpConfig.globalMcpServers);

    // 5. Build agent instructions
    const sessionCache = createSessionContextCache();
    const signal = abortController.signal;

    const [sessionResourceCtx, sessionProjectCtx] = await Promise.all([
      getSessionResourceContext(sessionCache, toolClient, signal).catch(
        () => null,
      ),
      getSessionProjectContext(sessionCache).catch(() => null),
    ]);

    const agentModel =
      getMastraCurrentModelId() ?? resolveGatewayModel(model, []);
    const agentInstructions = buildCodeMapAgentInstructions(
      sessionResourceCtx ?? null,
      sessionProjectCtx ?? null,
      agentModel,
    );

    // 6. Run agent — stream text tokens in text mode, collect in json mode
    let collectedText = "";

    // Track tool calls via callbacks (harness messages only include user message)
    const toolCalls: ToolCallSummary[] = [];
    const toolCallIds = new Map<string, number>(); // id -> index in toolCalls

    const result = await runSingleAgentRuntime({
      provider,
      providerId: gwConfig.provider,
      model,
      modeDefaults: gwConfig.modeDefaults,
      agentInstructions,
      userMessage: {
        role: "user",
        content: opts.prompt,
      },
      toolClient,
      signal,
      effort: opts.mode === "plan" ? "high" : "medium",
      planMode: opts.mode === "plan" || undefined,
      onToken:
        opts.format === "text" || !opts.format
          ? (text) => process.stdout.write(text)
          : (text) => {
              collectedText += text;
            },

      onToolStart: (name, args, id) => {
        const idx = toolCalls.length;
        toolCalls.push({ name, args });
        if (id) toolCallIds.set(id, idx);
      },
      onToolResult: (name, _result, id) => {
        // Match by toolCallId first (from events), fall back to name
        if (id && toolCallIds.has(id)) {
          toolCalls[toolCallIds.get(id)!].success = true;
        } else {
          // Fallback: find last unmatched call with this name
          for (let i = toolCalls.length - 1; i >= 0; i--) {
            if (toolCalls[i].name === name && toolCalls[i].success === undefined) {
              toolCalls[i].success = true;
              break;
            }
          }
        }
      },
    });

    // 7. Capture git diff stats for files changed
    let filesChanged: string[] = [];
    try {
      const { execSync } = await import("child_process");
      const stagedDiff = execSync("git diff --name-only --staged", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      const unstagedDiff = execSync("git diff --name-only", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      const untracked = execSync("git ls-files --others --exclude-standard", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();

      const allFiles = new Set<string>();
      if (stagedDiff) stagedDiff.split("\n").forEach((f) => allFiles.add(f));
      if (unstagedDiff)
        unstagedDiff.split("\n").forEach((f) => allFiles.add(f));
      if (untracked) untracked.split("\n").forEach((f) => allFiles.add(f));
      filesChanged = Array.from(allFiles);
    } catch {
      // Ignore — git may not be available or not in a repo
    }

    // 8. Format and output
    clearTimeout(timeoutHandle);
    const duration = Date.now() - startTime;

    if (opts.format === "json") {
      const output = JSON.stringify(
        {
          text: result.text || collectedText,
          usedTools: result.usedTools,
          unsupportedToolCalling: result.unsupportedToolCalling,
          duration,
          messages: result.messages,
          toolCalls,
          usage: result.usage,
          filesChanged,
        },
        null,
        2,
      );
      process.stdout.write(output + "\n");
    } else {
      // Text mode: tokens already streamed via onToken
      process.stdout.write("\n");
    }

    process.exitCode = 0;
  } catch (err) {
    clearTimeout(timeoutHandle);

    if (
      abortController.signal.aborted &&
      err instanceof DOMException &&
      err.name === "AbortError"
    ) {
      const duration = Date.now() - startTime;
      if (opts.format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              text: "",
              usedTools: false,
              unsupportedToolCalling: false,
              duration,
              error: "Timeout",
            },
            null,
            2,
          ) + "\n",
        );
      } else {
        process.stderr.write(
          `\n[headless] Timeout after ${opts.timeout ?? 300}s\n`,
        );
      }
      process.exitCode = 2;
      return;
    }

    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (opts.format === "json") {
      process.stdout.write(
        JSON.stringify(
          {
            text: "",
            usedTools: false,
            unsupportedToolCalling: false,
            duration,
            error: errorMessage,
          },
          null,
          2,
        ) + "\n",
      );
    } else {
      process.stderr.write(`\n[headless] Error: ${errorMessage}\n`);
    }
    process.exitCode = 1;
  } finally {
    // Restore stderr so cleanup errors are visible
    process.stderr.write = originalStderrWrite;
    if (toolClient) {
      await toolClient.close().catch(() => {});
    }
    await resetHarnessSingleton().catch(() => {});
  }
}

function formatOutput(result: HeadlessResult, format: string): string {
  if (format === "json") {
    return JSON.stringify(
      {
        text: result.text,
        usedTools: result.usedTools,
        unsupportedToolCalling: result.unsupportedToolCalling,
        duration: result.duration,
        messages: result.messages,
        toolCalls: result.toolCalls,
        usage: result.usage,
        filesChanged: result.filesChanged,
        error: result.error,
      },
      null,
      2,
    );
  }
  return result.text || result.error || "";
}
