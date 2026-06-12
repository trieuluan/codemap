import { NineRouterProvider, buildCodeMapAgentInstructions } from "@codemap-ai/core/agent";
import type {
  AgentSessionCommand,
  AgentSessionController,
} from "@codemap-ai/core/agent/contracts";
import {
  CodeMapMcpToolClient,
  createNodeAgentSession,
  createSessionContextCache,
  getSessionProjectContext,
  getSessionResourceContext,
  loadSettings,
  resetHarnessSingleton,
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
let availableModels: string[] = [];

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
  session?.abort();
  unsubscribeSession?.();
  unsubscribeSession = null;
  session = null;
  await toolClient?.close().catch(() => {});
  await resetHarnessSingleton().catch(() => {});

  const settings = await loadSettings(workspacePath);
  const gateway = settings.gateway ?? {};
  const baseUrl = gateway.baseUrl ?? "http://localhost:4000/v1";
  const model = gateway.defaultModel ?? gateway.modeDefaults?.build ?? "coder";
  const provider = new NineRouterProvider(baseUrl, gateway.apiKey);
  toolClient = new CodeMapMcpToolClient();
  await toolClient.connectExtras(settings.mcpServers);
  availableModels = await provider
    .listModels()
    .catch(() => [model]);

  const contextCache = createSessionContextCache();
  const [resourceContext, projectContext] = await Promise.all([
    getSessionResourceContext(contextCache, toolClient),
    getSessionProjectContext(contextCache),
  ]);
  const instructions = buildCodeMapAgentInstructions(
    resourceContext,
    projectContext,
    model,
  );

  session = createNodeAgentSession({
    provider,
    providerId: gateway.provider,
    model,
    modeDefaults: gateway.modeDefaults,
    availableModels,
    toolClient,
    agentInstructions: instructions,
  });
  unsubscribeSession = session.subscribe((event) =>
    post({ type: "agent_event", event }),
  );
  const metadata = await readSettingsMetadata();
  post({ type: "ready", workspacePath, settings: metadata });
  post({ type: "runtime_status", status: "ready" });
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
      return session.listThreads();
    case "switch_thread":
      return session.switchThread(command.threadId);
    case "new_thread":
      await initialize(workspacePath);
      return;
    case "respond_approval":
      session.respondToApproval(command.response);
      return;
    case "respond_question":
      session.respondToQuestion(command.response);
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
