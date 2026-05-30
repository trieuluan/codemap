import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type {
  CodeMapUser,
  McpAuthClaimResponse,
  McpAuthStatusResponse,
} from "@codemap/shared";
import { db } from "../../db";
import { auth } from "../../lib/auth";
import { createWorkspaceService } from "../workspace/service";

const MCP_AUTH_SESSION_KEY_PREFIX = "mcp:auth:session:";
const MCP_AUTH_SESSION_TTL_SECONDS = 60 * 5;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const MCP_API_KEY_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 90;
const MCP_API_KEY_NAME_MAX_LENGTH = 32;
const MCP_API_KEY_CACHE_PREFIX = "mcp:apikey:raw:";

type McpAuthSessionStatus = "pending" | "authorized" | "denied";

interface McpAuthSessionRecord {
  sessionId: string;
  clientName: string;
  deviceName: string | null;
  apiUrl: string;
  status: McpAuthSessionStatus;
  createdAt: string;
  expiresAt: string;
  apiKey: string | null;
  apiKeyCreatedAt: string | null;
  apiKeyDeliveredAt: string | null;
  user: CodeMapUser | null;
}

type McpAuthStatusResult = McpAuthStatusResponse;
type McpAuthClaimResult = McpAuthClaimResponse;

function getSessionKey(sessionId: string) {
  return `${MCP_AUTH_SESSION_KEY_PREFIX}${sessionId}`;
}

function getTtlSeconds(expiresAt: string) {
  const ttlSeconds = Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / 1000,
  );

  return Math.max(ttlSeconds, 1);
}

function buildMcpApiKeyMetadata(input: {
  clientName: string;
  deviceName: string | null;
  lastSessionId: string;
}) {
  return {
    client: "mcp",
    clientName: input.clientName,
    deviceName: input.deviceName,
    lastSessionId: input.lastSessionId,
  };
}

function buildMcpApiKeyName(input: {
  clientName: string;
  deviceName: string | null;
}) {
  const baseName = input.deviceName
    ? `${input.clientName} (${input.deviceName})`
    : input.clientName;
  const normalizedName = baseName.replace(/\s+/g, " ").trim();

  if (normalizedName.length <= MCP_API_KEY_NAME_MAX_LENGTH) {
    return normalizedName || "CodeMap MCP";
  }

  return normalizedName.slice(0, MCP_API_KEY_NAME_MAX_LENGTH).trimEnd();
}

function buildApiKeyCacheKey(userId: string, clientName: string, deviceName: string | null) {
  return `${MCP_API_KEY_CACHE_PREFIX}${userId}:${clientName}:${deviceName ?? ""}`;
}

export function createMcpService(
  redis: Redis,
  webAppUrl: string,
  apiUrl: string,
) {
  const workspaceService = createWorkspaceService(db);

  async function saveSession(record: McpAuthSessionRecord) {
    await redis.setex(
      getSessionKey(record.sessionId),
      getTtlSeconds(record.expiresAt),
      JSON.stringify(record),
    );
  }

  async function getSession(sessionId: string) {
    const rawValue = await redis.get(getSessionKey(sessionId));

    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as McpAuthSessionRecord;
  }


  async function prepareApiKeyForSession(input: {
    session: McpAuthSessionRecord;
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
    };
  }) {
    // Check Redis cache for a previously created raw key.
    // The DB only stores hashed keys, so we cache the raw key here to reuse
    // across login sessions on the same device.
    const cacheKey = buildApiKeyCacheKey(
      input.user.id,
      input.session.clientName,
      input.session.deviceName,
    );
    const cachedRawKey = await redis.get(cacheKey);

    if (cachedRawKey) {
      // Refresh metadata on the DB record so the key appears active
      const keyName = buildMcpApiKeyName({
        clientName: input.session.clientName,
        deviceName: input.session.deviceName,
      });
      // Best-effort update — don't fail login if this errors
      await auth.api.updateApiKey({
        body: { keyId: cachedRawKey.split("_")[1] ?? cachedRawKey, name: keyName },
      }).catch(() => {});

      return {
        key: cachedRawKey,
        createdAt: new Date().toISOString(),
      };
    }

    // No cached key — create a new one and cache the raw value
    const keyName = buildMcpApiKeyName({
      clientName: input.session.clientName,
      deviceName: input.session.deviceName,
    });
    const createdKey = await auth.api.createApiKey({
      body: {
        name: keyName,
        userId: input.user.id,
        expiresIn: MCP_API_KEY_EXPIRES_IN_SECONDS,
        metadata: buildMcpApiKeyMetadata({
          clientName: input.session.clientName,
          deviceName: input.session.deviceName,
          lastSessionId: input.session.sessionId,
        }),
      },
    });

    // Cache the raw key for reuse — same TTL as the key itself
    await redis.setex(cacheKey, MCP_API_KEY_EXPIRES_IN_SECONDS, createdKey.key);

    return {
      key: createdKey.key,
      createdAt: new Date().toISOString(),
    };
  }

  return {
    async startAuthSession(input: {
      clientName: string;
      deviceName?: string | null;
    }) {
      const sessionId = randomUUID();
      const createdAt = new Date();
      const expiresAt = new Date(
        createdAt.getTime() + MCP_AUTH_SESSION_TTL_SECONDS * 1000,
      );

      const record: McpAuthSessionRecord = {
        sessionId,
        clientName: input.clientName,
        deviceName: input.deviceName ?? null,
        apiUrl,
        status: "pending",
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        apiKey: null,
        apiKeyCreatedAt: null,
        apiKeyDeliveredAt: null,
        user: null,
      };

      await saveSession(record);

      return {
        sessionId,
        authorizeUrl: `${webAppUrl.replace(/\/+$/, "")}/mcp/authorize?sessionId=${encodeURIComponent(sessionId)}`,
        pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
        expiresAt: record.expiresAt,
      };
    },

    async getAuthSessionStatus(sessionId: string) {
      const session = await getSession(sessionId);

      if (!session) {
        return {
          sessionId,
          status: "expired" as const,
          expiresAt: null,
          clientName: null,
          deviceName: null,
          apiUrl,
          user: null,
          apiKeyReady: false,
          apiKeyClaimed: false,
          apiKeyDeliveredAt: null,
        };
      }

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await redis.del(getSessionKey(sessionId));

        return {
          sessionId,
          status: "expired" as const,
          expiresAt: session.expiresAt,
          clientName: session.clientName,
          deviceName: session.deviceName,
          apiUrl: session.apiUrl,
          user: session.user,
          apiKeyReady: Boolean(session.apiKey),
          apiKeyClaimed: Boolean(session.apiKeyDeliveredAt),
          apiKeyDeliveredAt: session.apiKeyDeliveredAt,
        };
      }

      const response: McpAuthStatusResult = {
        sessionId,
        status: session.status,
        expiresAt: session.expiresAt,
        clientName: session.clientName,
        deviceName: session.deviceName,
        apiUrl: session.apiUrl,
        user: session.user,
        apiKeyReady: Boolean(session.apiKey),
        apiKeyClaimed: Boolean(session.apiKeyDeliveredAt),
        apiKeyDeliveredAt: session.apiKeyDeliveredAt,
      };

      return response;
    },

    async claimAuthSession(sessionId: string) {
      const session = await getSession(sessionId);

      if (!session) {
        throw new Error("MCP_AUTH_SESSION_NOT_FOUND");
      }

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await redis.del(getSessionKey(sessionId));
        throw new Error("MCP_AUTH_SESSION_EXPIRED");
      }

      if (session.status !== "authorized") {
        throw new Error("MCP_AUTH_SESSION_NOT_AUTHORIZED");
      }

      if (!session.apiKey || session.apiKeyDeliveredAt) {
        throw new Error("MCP_AUTH_SESSION_ALREADY_CLAIMED");
      }

      const response: McpAuthClaimResult = {
        sessionId,
        status: "authorized",
        expiresAt: session.expiresAt,
        clientName: session.clientName,
        deviceName: session.deviceName,
        apiUrl: session.apiUrl,
        user: session.user,
        apiKeyReady: Boolean(session.apiKey),
        apiKeyClaimed: Boolean(session.apiKeyDeliveredAt),
        apiKeyDeliveredAt: session.apiKeyDeliveredAt,
        apiKey: session.apiKey,
      };

      session.apiKey = null;
      session.apiKeyDeliveredAt = new Date().toISOString();
      await saveSession(session);

      return response;
    },

    async approveAuthSession(
      sessionId: string,
      user: {
        id: string;
        email?: string | null;
        name?: string | null;
      },
    ) {
      const session = await getSession(sessionId);

      if (!session) {
        throw new Error("MCP_AUTH_SESSION_NOT_FOUND");
      }

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await redis.del(getSessionKey(sessionId));
        throw new Error("MCP_AUTH_SESSION_EXPIRED");
      }

      if (session.status === "authorized") {
        return session;
      }

      const personalWorkspace = await workspaceService.ensurePersonalWorkspace(user.id);
      const entitlements = workspaceService.getWorkspaceEntitlements(personalWorkspace);
      workspaceService.assertCanUseMcp(entitlements);

      const preparedApiKey = await prepareApiKeyForSession({
        session,
        user,
      });

      session.status = "authorized";
      session.apiKey = preparedApiKey.key;
      session.apiKeyCreatedAt = preparedApiKey.createdAt;
      session.user = {
        id: user.id,
        email: user.email ?? null,
        name: user.name ?? null,
      };

      await saveSession(session);

      await workspaceService.recordUsageEvent({
        workspaceId: personalWorkspace.id,
        userId: user.id,
        type: "mcp_session_created",
        metadataJson: {
          clientName: session.clientName,
          deviceName: session.deviceName,
          sessionId: session.sessionId,
        },
      });

      return session;
    },
  };
}
