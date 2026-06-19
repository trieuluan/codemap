import { NineRouterProvider, buildCodeMapAgentInstructions } from "@codemap-ai/core/agent";
import type {
  AgentSessionCommand,
  AgentSessionController,
} from "@codemap-ai/core/agent/contracts";
import type { GatewayModel } from "@codemap-ai/core/agent";
import type { CreateNodeAgentSessionOptions } from "@codemap-ai/runtime-node";
import {
  CodeMapMcpToolClient,
  createNodeAgentSession,
  createSessionContextCache,
  getSessionProjectContext,
  getSessionResourceContext,
  loadSettings,
  resetHarnessSingleton,
  warmupHarness,
} from "@codemap-ai/runtime-node";
import {
  redactSettingsMetadata,
  utilityCommandSchema,
  type RuntimeMessage,
  type UtilityCommand,
} from "../shared/ipc.js";

const parentPort = process.parentPort;
if (!parentPort) throw new Error("Desktop utility requires an Electron parent port");

let workspacePath = "";
let session: AgentSessionController | null = null;
let unsubscribeSession: (() => void) | null = null;
let toolClient: CodeMapMcpToolClient | null = null;
let availableModels: GatewayModel[] = [];

/** Resolves when background warmup (MCP connect, context load, harness init) is complete. */
let warmupPromise: Promise<void> | null = null;

parentPort.on("message", (event) => {
  void handleRawCommand(event.data);
});

post({ type: "runtime_status", status: "starting" });

async function handleRawCommand(raw: unknown): Promise<void> {
  const parsed = utilityCommandSchema.safeParse(raw);
  if (!parsed.success) return;
  const command = parsed.data;
  const requestId =
    command.type === "agent" ? command.command.requestId : command.requestId;
  try {
    const result = await handleCommand(command);
    post({ type: "request_result", requestId, result });
  } catch (error) {
    post({
      type: "request_error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildToolPreview(name: string, args: Record<string, unknown>): string | undefined {
  const s = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : undefined);
  // Strip MCP server prefix (e.g. "codemap_explore_task" → "explore_task")
  const local = name.includes("_") ? name.slice(name.indexOf("_") + 1) : name;
  switch (local) {
    case "explore_task": return s("task");
    case "search_codebase": return s("query");
    case "find_related_files": return s("query") ?? s("file_path") ?? s("symbol_name");
    case "get_file": {
      const p = args["path"];
      if (Array.isArray(p)) return p.slice(0, 2).join(", ") + (p.length > 2 ? ` +${p.length - 2}` : "");
      return s("path");
    }
    case "symbol": return s("symbol_name");
    case "view_ide": return s("path");
    case "write_file_ide":
    case "write_file": return s("path");
    case "string_replace_lsp_ide":
    case "string_replace_lsp": return s("path");
    case "execute_command_ide":
    case "execute_command": return s("command");
    case "search_content_ide":
    case "search_content": {
      const pattern = s("pattern");
      const path = s("path");
      return pattern && path ? `"${pattern}" in ${path}` : pattern ? `"${pattern}"` : undefined;
    }
    case "find_files_ide":
    case "find_files": return s("path");
    case "web_search_ide":
    case "web_search": return s("query");
    case "web_fetch_ide":
    case "web_fetch": return s("url");
    default: return undefined;
  }
}

async function handleCommand(command: UtilityCommand): Promise<unknown> {
  if (command.type === "initialize") {
    await initialize(command.workspacePath);
    return;
  }
  if (command.type === "read_settings") {
    return readSettingsMetadata();
  }
  if (!session) throw new Error("Agent session is not initialized");
  return handleAgentCommand(command.command);
}

async function initialize(nextWorkspacePath: string): Promise<void> {
  workspacePath = nextWorkspacePath;
  process.chdir(workspacePath);

  // Tear down existing session/harness
  session?.abort();
  unsubscribeSession?.();
  unsubscribeSession = null;
  session = null;
  warmupPromise = null;
  await toolClient?.close().catch(() => {});
  await resetHarnessSingleton().catch(() => {});

  // ── Fast path: only what's needed to create a session object ──────────
  const settings = await loadSettings(workspacePath);
  const gateway = settings.gateway ?? {};
  const baseUrl = gateway.baseUrl ?? "http://localhost:4000/v1";
  const model = gateway.defaultModel ?? gateway.modeDefaults?.build ?? "coder";
  const provider = new NineRouterProvider(baseUrl, gateway.apiKey);
  toolClient = new CodeMapMcpToolClient();

  // Fetch available models once — the gateway model list rarely changes across restarts
  if (availableModels.length === 0) {
    const models = await provider.listModelDetails().catch((): GatewayModel[] => [{ id: model }]);
    availableModels = models;
  }
  const availableModelIds = availableModels.map((m) => m.id);

  const sessionOptions: CreateNodeAgentSessionOptions = {
    provider,
    providerId: gateway.provider,
    model,
    modeDefaults: gateway.modeDefaults,
    availableModels: availableModelIds,
    toolClient,
    agentInstructions: undefined,
    toolPreviewBuilder: buildToolPreview,
  };

  session = createNodeAgentSession(sessionOptions);
  unsubscribeSession = session.subscribe((event) =>
    post({ type: "agent_event", event }),
  );

  // Emit ready immediately — UI can open and list threads as soon as harness warms up
  const metadata = redactSettingsMetadata({
    provider: gateway.provider,
    baseUrl,
    defaultModel: model,
    apiKey: gateway.apiKey,
    apiToken: settings.codemap?.apiToken,
    availableModels,
  });
  post({ type: "ready", workspacePath, settings: metadata });

  // ── Background: MCP connect, context load, harness warmup ─
  const capturedToolClient = toolClient;
  warmupPromise = (async () => {
    try {
      // Phase 1: parallel network/disk work
      await capturedToolClient.connectExtras(settings.mcpServers);

      const contextCache = createSessionContextCache();
      const [resourceContext, projectContext] = await Promise.all([
        getSessionResourceContext(contextCache, capturedToolClient),
        getSessionProjectContext(contextCache),
      ]);

      // Inject instructions into the live session — next send() will use them
      sessionOptions.agentInstructions = buildCodeMapAgentInstructions(
        resourceContext,
        projectContext,
        model,
      );

      // Phase 2: warm up Mastra harness (LibSQL, fastembed, MCP child process)
      await warmupHarness({
        toolClient: capturedToolClient,
        baseUrl: provider.baseUrl,
        apiKey: gateway.apiKey,
        modelId: model,
        availableModels: availableModelIds,
        providerId: gateway.provider,
        modeDefaults: gateway.modeDefaults,
        extraServerConfigs: capturedToolClient.getExtraServerConfigs(),
      });
    } catch {
      // Background warmup is best-effort — don't crash the utility process
    }
  })();
}

async function handleAgentCommand(
  command: AgentSessionCommand,
): Promise<unknown> {
  if (!session) throw new Error("Agent session is not initialized");
  switch (command.type) {
    case "send":
      await session.send({ requestId: command.requestId, ...command.input });
      return;
    case "abort":
      session.abort();
      return;
    case "list_threads":
      // Wait for background warmup before listing — harness must be ready for thread access.
      // Cap at 8 s so the UI isn't blocked indefinitely if warmup hangs.
      if (warmupPromise) {
        await Promise.race([
          warmupPromise,
          new Promise<void>((r) => setTimeout(r, 8_000)),
        ]);
      }
      return session.listThreads();
    case "switch_thread":
      // Wait for background warmup before switching — harness must be ready.
      if (warmupPromise) {
        await Promise.race([
          warmupPromise,
          new Promise<void>((r) => setTimeout(r, 8_000)),
        ]);
      }
      return session.switchThread(command.threadId);
    case "new_thread":
      await initialize(workspacePath);
      return;
    case "delete_thread":
      await session.deleteThread(command.threadId);
      return;
    case "respond_approval":
      session.respondToApproval(command.response);
      return;
    case "respond_question":
      session.respondToQuestion(command.response);
      return;
    case "respond_plan_review":
      session.respondToPlanReview(command.response);
      return;
  }
}

async function readSettingsMetadata() {
  const settings = await loadSettings(workspacePath || process.cwd());
  return redactSettingsMetadata({
    provider: settings.gateway?.provider,
    baseUrl: settings.gateway?.baseUrl,
    defaultModel: settings.gateway?.defaultModel,
    apiKey: settings.gateway?.apiKey,
    apiToken: settings.codemap?.apiToken,
    availableModels,
  });
}

function post(message: RuntimeMessage): void {
  parentPort?.postMessage(message);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  session?.abort();
  unsubscribeSession?.();
  await toolClient?.close().catch(() => {});
  await resetHarnessSingleton().catch(() => {});
  process.removeAllListeners(signal);
  process.kill(process.pid, signal);
}
