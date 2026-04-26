import os from "node:os";
import {
  type McpConfigAuth,
  type McpConfigUser,
  type McpServerConfig,
  saveGlobalConfig,
} from "../config.js";
import { createCodeMapClient, type CodeMapClient } from "./codemap-api.js";
import { openUrlInBrowser } from "./open-url.js";

export interface StartAuthResponse {
  sessionId: string;
  authorizeUrl: string;
  pollIntervalMs: number;
  expiresAt: string;
}

export interface AuthStatusResponse {
  sessionId: string;
  status: "pending" | "authorized" | "expired" | "denied";
  expiresAt: string | null;
  clientName: string | null;
  deviceName: string | null;
  apiUrl: string;
  user?: McpConfigUser | null;
  apiKeyReady?: boolean;
  apiKeyClaimed?: boolean;
  apiKeyDeliveredAt?: string | null;
}

export interface ClaimAuthResponse {
  sessionId: string;
  status: "authorized";
  expiresAt: string;
  clientName: string;
  deviceName: string | null;
  apiUrl: string;
  apiKey: string;
  user?: McpConfigUser | null;
}

interface AuthMeResponse {
  authenticated: true;
  apiUrl: string;
  user: McpConfigUser;
}

export interface WaitForAuthResult {
  authenticated: boolean;
  status: AuthStatusResponse["status"];
  apiUrl: string;
  user: McpConfigUser | null;
  expiresAt: string | null;
  timedOut?: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startMcpLogin(client: CodeMapClient) {
  return client.request<StartAuthResponse>("/mcp/auth/start", {
    method: "POST",
    body: {
      clientName: "CodeMap MCP",
      deviceName: os.hostname(),
    },
  });
}

export async function getMcpAuthStatus(client: CodeMapClient, sessionId: string) {
  return client.request<AuthStatusResponse>("/mcp/auth/status", {
    query: { sessionId },
  });
}

export async function getMcpWhoAmI(client: CodeMapClient) {
  return client.request<AuthMeResponse>("/mcp/auth/me", {
    authRequired: true,
  });
}

export async function claimMcpAuthSession(client: CodeMapClient, sessionId: string) {
  return client.request<ClaimAuthResponse>("/mcp/auth/claim", {
    method: "POST",
    body: { sessionId },
  });
}

export async function persistAuthorizedSession(
  config: McpServerConfig,
  status: Pick<ClaimAuthResponse, "apiUrl" | "apiKey" | "user">,
) {
  if (!status.apiKey) {
    throw new Error("Cannot persist MCP auth session without an API key.");
  }

  const auth: McpConfigAuth = {
    method: "api_key",
    createdAt: new Date().toISOString(),
    lastValidatedAt: new Date().toISOString(),
  };
  const apiUrl = status.apiUrl || config.apiUrl;

  await saveGlobalConfig({
    globalConfigPath: config.globalConfigPath,
    apiUrl,
    apiToken: status.apiKey,
    user: status.user ?? null,
    auth,
  });

  config.apiUrl = apiUrl;
  config.apiToken = status.apiKey;
  config.user = status.user ?? null;
  config.auth = auth;
}

export async function pollMcpAuthUntilDone(
  config: McpServerConfig,
  sessionId: string,
  options?: {
    expiresAt?: string | null;
    pollIntervalMs?: number | null;
    maxWaitMs?: number | null;
  },
): Promise<WaitForAuthResult> {
  // Client created once for the lifetime of this poll loop
  const client = createCodeMapClient(config);

  const pollIntervalMs =
    options?.pollIntervalMs && options.pollIntervalMs > 0
      ? options.pollIntervalMs
      : 2000;
  let effectiveExpiresAt = options?.expiresAt ?? null;
  const startedAtMs = Date.now();
  const maxWaitMs =
    options?.maxWaitMs !== undefined && options.maxWaitMs !== null
      ? Math.max(0, options.maxWaitMs)
      : null;

  while (true) {
    const status = await getMcpAuthStatus(client, sessionId);
    if (!effectiveExpiresAt && status.expiresAt) {
      effectiveExpiresAt = status.expiresAt;
    }
    const expiresAtMs = effectiveExpiresAt
      ? new Date(effectiveExpiresAt).getTime()
      : null;

    if (status.status === "authorized") {
      try {
        const claimResult = await claimMcpAuthSession(client, sessionId);
        await persistAuthorizedSession(config, claimResult);

        return {
          authenticated: true,
          status: "authorized",
          apiUrl: claimResult.apiUrl || config.apiUrl,
          user: claimResult.user ?? null,
          expiresAt: claimResult.expiresAt ?? effectiveExpiresAt,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("already been claimed")) {
          throw new Error(
            "Authorization completed, but the CodeMap MCP API key was already claimed by another client or request.",
          );
        }

        throw error;
      }
    }

    if (status.status === "expired") {
      return {
        authenticated: false,
        status: "expired",
        apiUrl: status.apiUrl || config.apiUrl,
        user: status.user ?? null,
        expiresAt: effectiveExpiresAt,
      };
    }

    if (status.status === "denied") {
      return {
        authenticated: false,
        status: "denied",
        apiUrl: status.apiUrl || config.apiUrl,
        user: status.user ?? null,
        expiresAt: effectiveExpiresAt,
      };
    }

    const nowMs = Date.now();

    if (expiresAtMs !== null && nowMs >= expiresAtMs) {
      return {
        authenticated: false,
        status: "expired",
        apiUrl: status.apiUrl || config.apiUrl,
        user: status.user ?? null,
        expiresAt: effectiveExpiresAt,
      };
    }

    if (maxWaitMs !== null && nowMs - startedAtMs >= maxWaitMs) {
      return {
        authenticated: false,
        status: "pending",
        apiUrl: status.apiUrl || config.apiUrl,
        user: status.user ?? null,
        expiresAt: effectiveExpiresAt,
        timedOut: true,
      };
    }

    const sleepMs = Math.min(
      pollIntervalMs,
      expiresAtMs !== null ? Math.max(0, expiresAtMs - nowMs) : pollIntervalMs,
      maxWaitMs !== null
        ? Math.max(0, maxWaitMs - (nowMs - startedAtMs))
        : pollIntervalMs,
    );

    if (sleepMs <= 0) {
      continue;
    }

    await sleep(sleepMs);
  }
}

export async function runLoginFlow(config: McpServerConfig) {
  const client = createCodeMapClient(config);
  const startResponse = await startMcpLogin(client);
  const openedBrowser = await tryOpenLoginBrowser(startResponse.authorizeUrl);
  const result = await waitForLoginAuthorization(config, startResponse);

  return {
    openedBrowser,
    authorizeUrl: startResponse.authorizeUrl,
    user: result.user ?? null,
    apiUrl: result.apiUrl || config.apiUrl,
  };
}

export async function tryOpenLoginBrowser(authorizeUrl: string) {
  try {
    await openUrlInBrowser(authorizeUrl);
    return true;
  } catch {
    return false;
  }
}

export async function waitForLoginAuthorization(
  config: McpServerConfig,
  startResponse: StartAuthResponse,
) {
  const result = await pollMcpAuthUntilDone(config, startResponse.sessionId, {
    expiresAt: startResponse.expiresAt,
    pollIntervalMs: startResponse.pollIntervalMs,
  });

  if (result.status === "authorized") {
    return {
      sessionId: startResponse.sessionId,
      status: "authorized" as const,
      expiresAt: result.expiresAt,
      apiUrl: result.apiUrl,
      user: result.user,
    };
  }

  if (result.status === "expired") {
    throw new Error("MCP login session expired before authorization completed.");
  }

  if (result.status === "denied") {
    throw new Error("MCP login was denied.");
  }

  throw new Error("MCP login timed out before authorization completed.");
}
