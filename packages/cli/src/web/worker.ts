import {
  NineRouterProvider,
  buildCodeMapAgentInstructions,
} from "@codemap-ai/core/agent";
import { loadConfig } from "@codemap-ai/core/config.js";
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
  getMastraMcpStatusSummary,
  loadSettings,
  resetHarnessSingleton,
  warmupHarness,
} from "@codemap-ai/runtime-node";
import { universalCommands } from "@codemap-ai/shared";
import type { UniversalCommandContext } from "@codemap-ai/shared";
import {
  redactSettingsMetadata,
  utilityCommandSchema,
  type RuntimeMessage,
  type UtilityCommand,
  type AccountInfo,
  type AccountLoginResult,
  type ListProjectsResult,
  type LinkProjectResult,
  type GraphData,
} from "@codemap-ai/web/contracts";
import { getLocalGraphData } from './local-graph.js';
import { createWebSessionState } from './session-state.js';
import { getSingleton } from '@codemap-ai/runtime-node/harness';
import { ensureLocalIndex } from '@codemap-ai/core/lib/local-index.js';
import { enableAutoIndexing as startIndexWatcher, disableAutoIndexing as stopIndexWatcher, isAutoIndexingActive } from '@codemap-ai/core/lib/auto-indexing.js';

let indexPromise: Promise<void> | null = null;
let indexError: string | undefined;
let indexWatchingEnabled = true;
let initializeAgentPromise: Promise<void> | null = null;
let changingThread = false;

function startIndex(force = false): Promise<void> {
  if (indexPromise) return indexPromise;
  post({type:'index_status',index:{status:'indexing'}});
  indexError = undefined;
  indexPromise = (async () => {
    try {
      await stopIndexWatcher();
      const store = await ensureLocalIndex({workspaceRootPath:workspacePath,force});
      if (indexWatchingEnabled) await startIndexWatcher(store,workspacePath).catch(error=>console.error('Auto-index watcher unavailable:',error instanceof Error?error.message:String(error)));
      post({type:'index_status',index:{status:'ready'}});
    } catch (error) {
      indexError = error instanceof Error ? error.message : String(error);
      post({type:'index_status',index:{status:'error',error:indexError}});
    } finally { indexPromise = null; }
  })();
  return indexPromise;
}
async function ensureAgent(): Promise<void> {
  if (changingThread) throw new Error('A thread change is already in progress');
  if (session) return;
  initializeAgentPromise ??= initializeAgent(workspacePath).finally(()=>{ initializeAgentPromise = null; });
  await initializeAgentPromise;
}

if (!process.send) throw new Error("Web runtime requires a parent IPC channel");

let workspacePath = "";
let session: AgentSessionController | null = null;
let unsubscribeSession: (() => void) | null = null;
let toolClient: CodeMapMcpToolClient | null = null;
let availableModels: GatewayModel[] = [];
let sessionState = createWebSessionState(event=>post({type:'agent_event',event}),()=>getSingleton()?.harness.getCurrentThreadId?.());




/** Resolves when background warmup (MCP connect, context load, harness init) is complete. */
let warmupPromise: Promise<void> | null = null;

/** Wait for MCP warmup so toolClient is available. Returns true if toolClient is ready. */
async function awaitWarmup(): Promise<boolean> {
  if (toolClient) return true;
  if (warmupPromise) {
    await Promise.race([
      warmupPromise,
      new Promise<void>((r) => setTimeout(r, 8_000)),
    ]);
  }
  return toolClient !== null;
}

process.on("message", (event) => {
  void handleRawCommand(event);
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
    workspacePath = command.workspacePath;
    process.chdir(workspacePath);
    post({type:'ready',workspacePath,settings:await readSettingsMetadata()});
    void startIndex();
    return;
  }
  if (command.type === "read_settings") {
    return readSettingsMetadata();
  }
  if (command.type === "get_mcp_status") {
    await ensureAgent();
    await awaitWarmup();
    const summary = await getMastraMcpStatusSummary();
    if (!summary) return null;
    // Enrich statuses with tool names + descriptions from toolClient
    if (toolClient) {
      try {
        const toolsByServer = await toolClient.listAllToolsGroupedByServer();
        summary.statuses = summary.statuses.map((s) => ({
          ...s,
          toolNames: toolsByServer[s.name]?.map((t) => t.name) ?? s.toolNames ?? [],
          toolDetails: toolsByServer[s.name] ?? [],
        }));
      } catch {
        summary.statuses = summary.statuses.map((s) => ({
          ...s,
          toolDetails: (s.toolNames ?? []).map((n) => ({ name: n, description: "" })),
        }));
      }
    } else {
      // toolClient not ready — construct basic toolDetails from manager's toolNames
      summary.statuses = summary.statuses.map((s) => ({
        ...s,
        toolDetails: (s.toolNames ?? []).map((n) => ({ name: n, description: "" })),
      }));
    }
    return summary;
  }
  if (command.type === "get_tools_list") {
    await ensureAgent();
    return getToolsList();
  }
  if (command.type === "run_slash_command") {
    await ensureAgent();
    return runSlashCommandInUtility(command.name, command.args);
  }
  if (command.type === "read_file_preview") {
    // read_file_preview is handled in main process, not utility
    return null;
  }
  if (command.type === "get_account_info") {
    return getAccountInfo();
  }
  if (command.type === "account_login") {
    await ensureAgent();
    return accountLogin();
  }
  if (command.type === "account_logout") {
    await ensureAgent();
    return accountLogout();
  }
  if (command.type === "list_projects") {
    await ensureAgent();
    return listProjects();
  }
  if (command.type === "link_project") {
    await ensureAgent();
    return linkProject(command.projectId);
  }
  if (command.type === "get_auto_index_status") {
    return {isActive:isAutoIndexingActive()};
  }
  if (command.type === "enable_auto_indexing") {
    indexWatchingEnabled = true;
    await startIndex();
    return {success:!indexError,error:indexError};
  }
  if (command.type === "disable_auto_indexing") {
    indexWatchingEnabled = false;
    await stopIndexWatcher();
    return {success:true};
  }
  if (command.type === "retry_index") {
    await startIndex(true);
    return {success:!indexError,error:indexError};
  }
  if (command.type === "get_graph_data") {
    if (indexPromise) await indexPromise;
    if (indexError) return {nodes:[],edges:[],timestamp:Date.now(),error:indexError};
    return getGraphData();
  }
  await ensureAgent();
  return handleAgentCommand(command.command);
}

async function initializeAgent(nextWorkspacePath: string): Promise<void> {
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
  sessionState = createWebSessionState(event=>post({type:'agent_event',event}),()=>getSingleton()?.harness.getCurrentThreadId?.());
  unsubscribeSession = session.subscribe(event=>sessionState.receive(event));

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
  if (changingThread) throw new Error('A thread change is already in progress');
  const changesThread = command.type === 'switch_thread' || command.type === 'new_thread' || command.type === 'delete_thread';
  if (changesThread) {
    sessionState.assertCanChangeThread();
    changingThread = true;
  }
  try {
  switch (command.type) {
    case "send":
      sessionState.begin({requestId:command.requestId,...command.input});
      try {
        await session.send({ requestId: command.requestId, ...command.input });
      } catch (error) {
        if (sessionState.snapshot.status !== 'error') sessionState.receive({type:'error',requestId:command.requestId,message:error instanceof Error?error.message:String(error)});
        throw error;
      } finally { sessionState.finish(); }
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
      sessionState.assertCanChangeThread();
      // Wait for background warmup before switching — harness must be ready.
      if (warmupPromise) {
        await Promise.race([
          warmupPromise,
          new Promise<void>((r) => setTimeout(r, 8_000)),
        ]);
      }
      return await session.switchThread(command.threadId);
    case "new_thread":
      sessionState.assertCanChangeThread();
      await initializeAgent(workspacePath);
      return;
    case "delete_thread":
      sessionState.assertCanChangeThread();
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
  } finally { if (changesThread) changingThread = false; }
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

async function runSlashCommandInUtility(name: string, args: string): Promise<{ output: string }> {
  const cmd = universalCommands.find((c: { name: string }) => c.name === name);
  if (!cmd) return { output: `Unknown command: /${name}` };

  const ctx: UniversalCommandContext = {
    appendMessage: () => {},
    getMessages: () => [],
    setMessages: () => {},
    currentModel: availableModels[0]?.id ?? "coder",
    availableModels: availableModels.map((m) => m.id),
    toolClient: toolClient as unknown as UniversalCommandContext["toolClient"],
    workspacePath: workspacePath || process.cwd(),
    isConnected: true,
    setIsConnected: () => {},
  };

  try {
    const output = await cmd.execute(args, ctx);
    return { output };
  } catch (error) {
    return { output: `# Error\n\nError executing /${name}: ${(error as Error).message}` };
  }
}

async function getAccountInfo(): Promise<AccountInfo> {
  if (!(await awaitWarmup()) || !toolClient) {
    // Fallback: use loadConfig if MCP not available
    const config = await loadConfig(workspacePath || process.cwd());
    if (!config.apiToken) return { loggedIn: false };
    return {
      loggedIn: true,
      apiUrl: config.apiUrl || "https://api.codemap.codes",
      user: config.user
        ? { email: config.user.email ?? undefined, name: config.user.name ?? undefined }
        : undefined,
    };
  }
  try {
    const result = await toolClient.callTool("check_auth_status", {});
    const sc = result.structuredContent as Record<string, unknown> | undefined;
    if (result.isError || !sc) return { loggedIn: false };
    const data = (sc.data ?? sc) as Record<string, unknown>;
    const user = data.user as Record<string, unknown> | null | undefined;
    return {
      loggedIn: Boolean(data.authenticated),
      apiUrl: (data.apiUrl as string) || undefined,
      user: user
        ? { email: (user.email as string) ?? undefined, name: (user.name as string) ?? undefined }
        : undefined,
    };
  } catch {
    const config = await loadConfig(workspacePath || process.cwd());
    if (!config.apiToken) return { loggedIn: false };
    return { loggedIn: true, apiUrl: config.apiUrl || "https://api.codemap.codes" };
  }
}

async function accountLogin(): Promise<AccountLoginResult> {
  // Quick check: already logged in via local config
  const config = await loadConfig(workspacePath || process.cwd());
  if (config.apiToken) {
    return {
      success: true,
      user: config.user
        ? { email: config.user.email ?? undefined, name: config.user.name ?? undefined }
        : undefined,
    };
  }
  if (!(await awaitWarmup()) || !toolClient) {
    return { success: false, error: "MCP tool client not initialized. Please restart the app." };
  }
  try {
    const result = await toolClient.callTool("login", {});
    const sc = result.structuredContent as Record<string, unknown> | undefined;
    if (result.isError || !sc) {
      return { success: false, error: result.content || "Login failed" };
    }
    const data = (sc.data ?? sc) as Record<string, unknown>;
    const user = data.user as Record<string, unknown> | null | undefined;
    if (data.status === "authorized") {
      return {
        success: true,
        user: user
          ? { email: (user.email as string) ?? undefined, name: (user.name as string) ?? undefined }
          : undefined,
      };
    }
    return {
      success: false,
      error: (data.message as string) || `Login ${data.status}`,
      authorizeUrl: data.authorizeUrl as string | undefined,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function accountLogout(): Promise<{ success: boolean; error?: string }> {
  if (!(await awaitWarmup()) || !toolClient) {
    return { success: false, error: "MCP tool client not initialized. Please restart the app." };
  }
  try {
    const result = await toolClient.callTool("logout", {});
    if (result.isError) {
      return { success: false, error: result.content || "Logout failed" };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function listProjects(): Promise<ListProjectsResult> {
  if (!(await awaitWarmup()) || !toolClient) {
    return { projects: [], error: "MCP tool client not initialized. Please restart the app." };
  }
  try {
    const result = await toolClient.callTool("list_projects", {});
    if (result.isError) {
      return { projects: [], error: result.content || "Failed to list projects" };
    }
    const sc = result.structuredContent as Record<string, unknown> | undefined;
    if (!sc) return { projects: [], error: "No data returned" };
    const data = (sc.data ?? sc) as Record<string, unknown>;
    const items = (data.items ?? []) as Array<{
      id: string;
      name: string;
      status: string;
      repositoryUrl?: string | null;
    }>;
    const projects = items.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status ?? "unknown",
      repoUrl: p.repositoryUrl ?? undefined,
    }));
    return { projects };
  } catch (error) {
    return { projects: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function linkProject(projectId: string): Promise<LinkProjectResult> {
  if (!toolClient) {
    return { success: false, error: "MCP tool client not initialized" };
  }
  try {
    await toolClient.callTool("link_project", { project_id: projectId });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getToolsList() {
  await awaitWarmup();
  if (!toolClient) {
    return { tools: [], groupedByServer: {} };
  }
  try {
    const groupedByServer = await toolClient.listAllToolsGroupedByServer();
    const tools = Object.values(groupedByServer).flat();
    return { tools, groupedByServer };
  } catch {
    return { tools: [], groupedByServer: {} };
  }
}

function post(message: RuntimeMessage): void {
  process.send?.(message);
}

async function getGraphData(): Promise<GraphData> {
  try {
    return await getLocalGraphData(workspacePath || process.cwd());
  } catch (err) {
    return { nodes: [], edges: [], timestamp: Date.now(), error: (err as Error).message };
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

let shuttingDown = false;
process.once('disconnect',()=>{void shutdown('SIGTERM');});
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  session?.abort();
  unsubscribeSession?.();
  await stopIndexWatcher().catch(() => {});
  await toolClient?.close().catch(() => {});
  await resetHarnessSingleton().catch(() => {});
  process.removeAllListeners(signal);
  process.kill(process.pid, signal);
}
