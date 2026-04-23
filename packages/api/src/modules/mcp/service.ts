import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { apikey } from "../../db/schema";
import { auth } from "../../lib/auth";

const MCP_AUTH_SESSION_KEY_PREFIX = "mcp:auth:session:";
const MCP_AUTH_SESSION_TTL_SECONDS = 60 * 5;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const MCP_API_KEY_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 90;

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
  user: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
}

interface McpAuthStatusResult {
  sessionId: string;
  status: "pending" | "authorized" | "expired" | "denied";
  expiresAt: string | null;
  clientName: string | null;
  deviceName: string | null;
  apiUrl: string;
  user?: McpAuthSessionRecord["user"];
}

interface McpAuthClaimResult extends McpAuthStatusResult {
  status: "authorized";
  expiresAt: string;
  clientName: string;
  apiKey: string;
}

interface McpApiKeyMetadata {
  client?: string;
  clientName?: string;
  deviceName?: string | null;
  lastSessionId?: string;
}

function getSessionKey(sessionId: string) {
  return `${MCP_AUTH_SESSION_KEY_PREFIX}${sessionId}`;
}

function getTtlSeconds(expiresAt: string) {
  const ttlSeconds = Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / 1000,
  );

  return Math.max(ttlSeconds, 1);
}

function parseMcpApiKeyMetadata(metadata: string | null): McpApiKeyMetadata | null {
  if (!metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;

    return {
      client: typeof parsed.client === "string" ? parsed.client : undefined,
      clientName:
        typeof parsed.clientName === "string" ? parsed.clientName : undefined,
      deviceName:
        typeof parsed.deviceName === "string"
          ? parsed.deviceName
          : parsed.deviceName === null
            ? null
            : undefined,
      lastSessionId:
        typeof parsed.lastSessionId === "string" ? parsed.lastSessionId : undefined,
    };
  } catch {
    return null;
  }
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

export function createMcpService(
  redis: Redis,
  webAppUrl: string,
  apiUrl: string,
) {
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

  async function findReusableApiKey(input: {
    userId: string;
    clientName: string;
    deviceName: string | null;
  }) {
    const now = new Date();
    const candidateKeys = await db
      .select()
      .from(apikey)
      .where(
        and(
          eq(apikey.referenceId, input.userId),
          eq(apikey.enabled, true),
          or(isNull(apikey.expiresAt), gt(apikey.expiresAt, now)),
        ),
      )
      .orderBy(desc(apikey.updatedAt), desc(apikey.createdAt));

    for (const candidateKey of candidateKeys) {
      const metadata = parseMcpApiKeyMetadata(candidateKey.metadata);

      if (
        metadata?.client === "mcp" &&
        metadata.clientName === input.clientName &&
        (metadata.deviceName ?? null) === input.deviceName
      ) {
        return candidateKey;
      }
    }

    return null;
  }

  async function prepareApiKeyForSession(input: {
    session: McpAuthSessionRecord;
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
    };
  }) {
    const reusableKey = await findReusableApiKey({
      userId: input.user.id,
      clientName: input.session.clientName,
      deviceName: input.session.deviceName,
    });

    if (reusableKey) {
      await db
        .update(apikey)
        .set({
          metadata: JSON.stringify(
            buildMcpApiKeyMetadata({
              clientName: input.session.clientName,
              deviceName: input.session.deviceName,
              lastSessionId: input.session.sessionId,
            }),
          ),
        })
        .where(eq(apikey.id, reusableKey.id));

      return {
        key: reusableKey.key,
        createdAt: new Date().toISOString(),
      };
    }

    const keyName = input.session.deviceName
      ? `${input.session.clientName} (${input.session.deviceName})`
      : input.session.clientName;
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

      return session;
    },
  };
}
