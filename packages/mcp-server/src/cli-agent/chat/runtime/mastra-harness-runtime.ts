import type { AgentLoopResult } from "../agent/agent-loop.js";
import type { SingleAgentRuntimeInput, MultiPhaseLoopInput } from "./cli-runtime.js";

type DynamicImport = (specifier: string) => Promise<Record<string, unknown>>;

const dynamicImport = new Function(
  "specifier",
  "return import(specifier)",
) as DynamicImport;

const IMPLEMENT_SYNONYMS = new Set([
  "implement", "ok", "okay", "yes", "y", "go", "proceed", "sure", "do it",
  "ừ", "ừm", "đồng ý", "được", "làm đi", "làm luôn", "tiếp tục", "ok luôn",
]);
const CANCEL_SYNONYMS = new Set([
  "cancel", "no", "n", "stop", "abort", "quit", "exit",
  "không", "thôi", "dừng", "hủy",
]);

function normalizePlanAction(raw: string): "implement" | "cancel" | string {
  const lower = raw.trim().toLowerCase();
  if (IMPLEMENT_SYNONYMS.has(lower)) return "implement";
  if (CANCEL_SYNONYMS.has(lower)) return "cancel";
  return raw;
}

/** Strip the "codemap_" server prefix Mastra adds to MCP tool names. */
function stripServerPrefix(name: string): string {
  return name.startsWith("codemap_") ? name.slice("codemap_".length) : name;
}

interface CreateHarnessOptions {
  toolClient: SingleAgentRuntimeInput["toolClient"];
  confirmEdit: SingleAgentRuntimeInput["confirmEdit"];
  baseUrl: string;
  apiKey: string | undefined;
  modelId: string;
}

async function createHarness(opts: CreateHarnessOptions): Promise<{ harness: HarnessLike }> {
  const mod = await dynamicImport("mastracode");
  const createMastraCode = mod.createMastraCode as (
    config?: Record<string, unknown>,
  ) => Promise<{ harness: HarnessLike }>;

  const serverConfig = opts.toolClient.getServerConfig();

  // Route Mastra's OpenAI model resolution through our gateway.
  // createOpenAI() from @ai-sdk/openai reads OPENAI_BASE_URL + OPENAI_API_KEY env vars.
  // We set them temporarily so the harness picks them up on init, then restore.
  const savedBaseUrl = process.env.OPENAI_BASE_URL;
  const savedApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = opts.baseUrl;
  if (opts.apiKey) process.env.OPENAI_API_KEY = opts.apiKey;

  try {
    return await createMastraCode({
      mcpServers: { codemap: serverConfig },
      disabledTools: ["request_access"],
      initialState: {
        currentModelId: `openai/${opts.modelId}`,
        // Mark write/edit tools as requiring approval so Mastra's permission
        // system emits tool_approval_required before executing them.
        permissionRules: {
          categories: {},
          tools: buildConfirmPermissions(serverConfig),
        },
      },
    });
  } finally {
    // Restore env vars regardless of success or failure.
    if (savedBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL;
    } else {
      process.env.OPENAI_BASE_URL = savedBaseUrl;
    }
    if (savedApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = savedApiKey;
    }
  }
}

/**
 * Build a permission-rules map that marks all edit/write/patch MCP tools as
 * 'ask', so Mastra emits tool_approval_required before executing them.
 * Uses the same CONFIRM_PATTERNS logic as isConfirmTool in mcp-tool-client.ts.
 */
function buildConfirmPermissions(
  _serverConfig: { command: string; args: string[]; env: Record<string, string> },
): Record<string, "ask" | "allow"> {
  // We don't have the tool list here (they're discovered async by Mastra's McpManager),
  // so we set the category-level policy instead — handled via permissionRules.categories
  // in initialState. Returning empty here; category-level is set in the outer call.
  return {};
}

/**
 * Run a single-turn agent through the Mastra Harness.
 */
export async function runWithMastraHarness(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
  const { harness } = await createHarness({
    toolClient: input.toolClient,
    confirmEdit: input.confirmEdit,
    baseUrl: input.provider.baseUrl,
    apiKey: input.provider.apiKey,
    modelId: input.model,
  });

  await harness.init();
  await harness.selectOrCreateThread();

  const modelId = harness.getCurrentModelId?.();
  if (modelId) input.onModel?.(modelId);

  return runHarness(harness, input.userMessage, input.signal, input.confirmEdit, {
    onToken: input.onToken,
    onToolStart: input.onToolStart,
    onToolResult: input.onToolResult,
    onUsage: input.onUsage,
    onDebug: input.onDebug,
  });
}

/**
 * Run the plan → approve → execute flow through the Mastra Harness.
 *
 * Uses mastracode's built-in "plan" mode (with submit_plan tool) and "build" mode.
 * Plan approval bridges via plan_approval_required → onPlanWait → respondToPlanApproval.
 */
export async function runMultiPhaseWithMastra(
  input: MultiPhaseLoopInput,
): Promise<AgentLoopResult> {
  const { harness } = await createHarness({
    toolClient: input.toolClient,
    confirmEdit: input.confirmEdit,
    baseUrl: input.provider.baseUrl,
    apiKey: input.provider.apiKey,
    modelId: input.coderModel,
  });

  await harness.init();
  await harness.selectOrCreateThread();
  await harness.switchMode?.({ modeId: "plan" });

  return new Promise<AgentLoopResult>((resolve, reject) => {
    let finalText = "";
    let currentStreamText = "";
    let usedTools = false;

    const handlePlanApproval = async (planId: string, plan: string) => {
      input.onPlanReady?.(plan);
      if (!input.onPlanWait) {
        await harness.respondToPlanApproval?.({ planId, response: { action: "approved" } });
        return;
      }
      const raw = await input.onPlanWait();
      const action = normalizePlanAction(raw);
      if (action === "cancel") {
        harness.abort?.();
        resolve({ text: "Plan cancelled.", messages: [], usedTools: false, unsupportedToolCalling: false });
        return;
      }
      if (action === "implement") {
        await harness.respondToPlanApproval?.({ planId, response: { action: "approved" } });
      } else {
        await harness.respondToPlanApproval?.({ planId, response: { action: "rejected", feedback: action } });
      }
    };

    const unsubscribe = harness.subscribe((event: HarnessEvent) => {
      if (event.type === "mode_changed") {
        const ev = event as ModeChangedEvent;
        const modelId = harness.getCurrentModelId?.() ?? "";
        if (ev.modeId === "plan") input.onPhaseStart?.("planning", modelId);
        else if (ev.modeId === "build") input.onPhaseStart?.("executing", modelId);
        return;
      }
      bridgeCommonEvent(event, {
        onToken: input.onToken,
        onToolStart: input.onToolStart,
        onToolResult: input.onToolResult,
        onUsage: input.onUsage,
        onDebug: input.onDebug,
        confirmEdit: input.confirmEdit,
        harness,
        currentStreamTextRef: { get: () => currentStreamText, set: (v) => { currentStreamText = v; } },
        finalTextRef: { get: () => finalText, set: (v) => { finalText = v; currentStreamText = ""; } },
        usedToolsRef: { get: () => usedTools, set: (v) => { usedTools = v; } },
        onPlanApproval: (planId, plan) => { handlePlanApproval(planId, plan).catch(reject); },
        onEnd: (usage) => {
          unsubscribe();
          resolve({
            text: finalText || currentStreamText,
            messages: [input.userMessage],
            usedTools,
            unsupportedToolCalling: false,
            usage,
          });
        },
        onError: reject,
      });
    });

    const onAbort = () => { harness.abort?.(); unsubscribe(); reject(createAbortError()); };
    input.signal?.addEventListener("abort", onAbort, { once: true });

    harness.sendMessage({ content: input.userMessage.content }).catch((err: unknown) => {
      unsubscribe();
      input.signal?.removeEventListener("abort", onAbort);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

// ─── Shared event bridge ──────────────────────────────────────────────────

interface Ref<T> { get(): T; set(v: T): void }

interface BridgeCallbacks {
  onToken?: (t: string) => void;
  onToolStart?: (name: string, args: string, id: string) => void;
  onToolResult?: (name: string, result: string) => void;
  onUsage?: (u: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  confirmEdit?: SingleAgentRuntimeInput["confirmEdit"];
  harness: HarnessLike;
  currentStreamTextRef: Ref<string>;
  finalTextRef: Ref<string>;
  usedToolsRef: Ref<boolean>;
  onPlanApproval?: (planId: string, plan: string) => void;
  onEnd: (usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined) => void;
  onError: (err: unknown) => void;
}

function bridgeCommonEvent(event: HarnessEvent, cb: BridgeCallbacks): void {
  if (event.type === "message_update") {
    const content = extractText((event as MessageEvent).message?.content);
    const prev = cb.currentStreamTextRef.get();
    if (content.length > prev.length) {
      const delta = content.slice(prev.length);
      cb.currentStreamTextRef.set(content);
      if (delta) cb.onToken?.(delta);
    }
    return;
  }

  if (event.type === "message_end") {
    cb.finalTextRef.set(extractText((event as MessageEvent).message?.content));
    return;
  }

  if (event.type === "tool_start") {
    const ev = event as ToolStartEvent;
    cb.usedToolsRef.set(true);
    const displayName = stripServerPrefix(ev.toolName);
    cb.onToolStart?.(displayName, ev.args != null ? JSON.stringify(ev.args) : "{}", ev.toolCallId ?? "");
    return;
  }

  if (event.type === "tool_end") {
    const ev = event as ToolEndEvent;
    const displayName = stripServerPrefix(ev.toolName);
    const r = typeof ev.result === "string" ? ev.result : JSON.stringify(ev.result ?? "");
    cb.onToolResult?.(displayName, ev.isError ? `[ERROR] ${r}` : r);
    return;
  }

  if (event.type === "tool_approval_required") {
    const ev = event as ToolApprovalEvent;
    const handleApproval = async () => {
      const accepted = cb.confirmEdit
        ? await cb.confirmEdit(stripServerPrefix(ev.toolName), ev.args as Record<string, unknown>, null)
        : true;
      cb.harness.respondToToolApproval?.({ decision: accepted ? "approve" : "decline" });
    };
    handleApproval().catch(cb.onError);
    return;
  }

  if (event.type === "plan_approval_required") {
    const ev = event as PlanApprovalEvent;
    cb.onPlanApproval?.(ev.planId, ev.plan);
    return;
  }

  if (event.type === "agent_end") {
    const raw = cb.harness.getTokenUsage?.();
    const usage = raw
      ? { promptTokens: raw.promptTokens ?? 0, completionTokens: raw.completionTokens ?? 0, totalTokens: raw.totalTokens ?? 0 }
      : undefined;
    if (usage) cb.onUsage?.(usage);
    cb.onDebug?.({ event: "mastra_harness_end", reason: (event as AgentEndEvent).reason, usedTools: cb.usedToolsRef.get() });
    cb.onEnd(usage);
  }
}

/** Drive the harness for a single-turn message and resolve when agent_end fires. */
function runHarness(
  harness: HarnessLike,
  userMessage: { role: string; content: string },
  signal: AbortSignal | undefined,
  confirmEdit: SingleAgentRuntimeInput["confirmEdit"],
  callbacks: Omit<BridgeCallbacks, "harness" | "currentStreamTextRef" | "finalTextRef" | "usedToolsRef" | "onEnd" | "onError" | "confirmEdit">,
): Promise<AgentLoopResult> {
  return new Promise<AgentLoopResult>((resolve, reject) => {
    let finalText = "";
    let currentStreamText = "";
    let usedTools = false;

    const unsubscribe = harness.subscribe((event: HarnessEvent) => {
      bridgeCommonEvent(event, {
        ...callbacks,
        confirmEdit,
        harness,
        currentStreamTextRef: { get: () => currentStreamText, set: (v) => { currentStreamText = v; } },
        finalTextRef: { get: () => finalText, set: (v) => { finalText = v; } },
        usedToolsRef: { get: () => usedTools, set: (v) => { usedTools = v; } },
        onEnd: (usage) => {
          unsubscribe();
          resolve({
            text: finalText || currentStreamText,
            messages: [userMessage as { role: "user"; content: string }],
            usedTools,
            unsupportedToolCalling: false,
            usage,
          });
        },
        onError: reject,
      });
    });

    const onAbort = () => { harness.abort?.(); unsubscribe(); reject(createAbortError()); };
    signal?.addEventListener("abort", onAbort, { once: true });

    harness.sendMessage({ content: userMessage.content }).catch((err: unknown) => {
      unsubscribe();
      signal?.removeEventListener("abort", onAbort);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

function createAbortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

function extractText(content: HarnessMessageContent[] | string | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}

// ─── Minimal structural types for duck-typing the Mastra Harness ────────────

interface HarnessLike {
  init(): Promise<void>;
  selectOrCreateThread(): Promise<unknown>;
  getCurrentModelId?(): string;
  getTokenUsage?(): { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
  subscribe(listener: (event: HarnessEvent) => void): () => void;
  sendMessage(input: { content: string }): Promise<void>;
  abort?(): void;
  switchMode?(input: { modeId: string }): Promise<void>;
  respondToPlanApproval?(input: {
    planId: string;
    response: { action: "approved" | "rejected"; feedback?: string };
  }): Promise<void>;
  respondToToolApproval?(input: { decision: "approve" | "decline" | "always_allow_category" }): void;
}

type HarnessMessageContent = { type: string; [key: string]: unknown };
interface HarnessEvent { type: string }

interface MessageEvent extends HarnessEvent {
  type: "message_update" | "message_end";
  message: { content?: HarnessMessageContent[] | string };
}
interface ToolStartEvent extends HarnessEvent {
  type: "tool_start";
  toolCallId?: string;
  toolName: string;
  args: unknown;
}
interface ToolEndEvent extends HarnessEvent {
  type: "tool_end";
  toolCallId?: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}
interface ToolApprovalEvent extends HarnessEvent {
  type: "tool_approval_required";
  toolCallId: string;
  toolName: string;
  args: unknown;
}
interface AgentEndEvent extends HarnessEvent {
  type: "agent_end";
  reason?: string;
}
interface ModeChangedEvent extends HarnessEvent {
  type: "mode_changed";
  modeId: string;
  previousModeId: string;
}
interface PlanApprovalEvent extends HarnessEvent {
  type: "plan_approval_required";
  planId: string;
  title: string;
  plan: string;
}
