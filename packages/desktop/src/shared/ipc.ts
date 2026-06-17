import { z } from "zod";
import {
  agentSessionCommandSchema,
  agentSessionEventSchema,
  type AgentSessionCommand,
  type AgentSessionEvent,
  type ThreadSummary,
} from "@codemap-ai/core/agent/contracts";

const requestIdSchema = z.string().min(1);

export const desktopCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("select_workspace"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("open_workspace"),
      requestId: requestIdSchema,
      workspacePath: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("agent"),
      command: agentSessionCommandSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("read_settings"),
      requestId: requestIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("restart_runtime"),
      requestId: requestIdSchema,
    })
    .strict(),
]);

export const utilityCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("initialize"),
      requestId: requestIdSchema,
      workspacePath: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("agent"),
      command: agentSessionCommandSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("read_settings"),
      requestId: requestIdSchema,
    })
    .strict(),
]);

const settingsMetadataSchema = z
  .object({
    provider: z.string(),
    baseUrl: z.string(),
    defaultModel: z.string(),
    availableModels: z.array(z.string()),
    hasApiKey: z.boolean(),
    hasApiToken: z.boolean(),
  })
  .strict();

export const runtimeMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ready"),
      workspacePath: z.string(),
      settings: settingsMetadataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("agent_event"),
      event: agentSessionEventSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("request_result"),
      requestId: requestIdSchema,
      result: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("request_error"),
      requestId: requestIdSchema,
      message: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("runtime_status"),
      status: z.enum(["starting", "ready", "disconnected"]),
      message: z.string().optional(),
    })
    .strict(),
]);

export type DesktopCommand = z.infer<typeof desktopCommandSchema>;
export type RuntimeMessage = z.infer<typeof runtimeMessageSchema>;
export type UtilityCommand = z.infer<typeof utilityCommandSchema>;

export interface SettingsMetadataInput {
  provider?: string;
  baseUrl?: string;
  defaultModel?: string;
  availableModels?: string[];
  apiKey?: string;
  apiToken?: string;
}

export interface SettingsMetadata {
  provider: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: string[];
  hasApiKey: boolean;
  hasApiToken: boolean;
}

export function redactSettingsMetadata(
  settings: SettingsMetadataInput,
): SettingsMetadata {
  return {
    provider: settings.provider ?? "9router",
    baseUrl: settings.baseUrl ?? "http://localhost:4000/v1",
    defaultModel: settings.defaultModel ?? "coder",
    availableModels: settings.availableModels ?? [
      settings.defaultModel ?? "coder",
    ],
    hasApiKey: Boolean(settings.apiKey),
    hasApiToken: Boolean(settings.apiToken),
  };
}

export interface DesktopApi {
  openWorkspace(): Promise<string | null>;
  openWorkspacePath(workspacePath: string): Promise<string>;
  send(content: string, options?: {
    model?: string;
    effort?: "low" | "medium" | "high";
    planMode?: boolean;
    images?: Array<{ data: string; mimeType: string; filename?: string }>;
  }): Promise<void>;
  abort(): Promise<void>;
  listThreads(): Promise<ThreadSummary[]>;
  switchThread(threadId: string): Promise<void>;
  newThread(): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  respondToApproval(
    approvalId: string,
    decision: "approve" | "decline" | "always_allow_category",
  ): Promise<void>;
  respondToQuestion(
    questionId: string,
    answer: string | string[],
  ): Promise<void>;
  readSettings(): Promise<SettingsMetadata>;
  restartRuntime(): Promise<void>;
  onAgentEvent(listener: (event: AgentSessionEvent) => void): () => void;
  onRuntimeStatus(
    listener: (status: "starting" | "ready" | "disconnected") => void,
  ): () => void;
}

export type { AgentSessionCommand, AgentSessionEvent };

export const DESKTOP_IPC = {
  command: "codemap:command",
  event: "codemap:event",
} as const;
