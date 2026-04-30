import { and, desc, eq } from "drizzle-orm";
import type { db as dbType } from "../../db";
import { apikey } from "../../db/schema";
import { auth } from "../../lib/auth";
import type { CreateApiKeyBody } from "./schema";

const NINETY_DAYS_IN_SECONDS = 60 * 60 * 24 * 90;

type Database = typeof dbType;

type ApiKeyMetadata = {
  client?: string;
  clientName?: string;
  deviceName?: string | null;
  lastSessionId?: string;
  createdBy?: string;
} | null;

function parseApiKeyMetadata(metadata: string | null): ApiKeyMetadata {
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
      createdBy:
        typeof parsed.createdBy === "string" ? parsed.createdBy : undefined,
    };
  } catch {
    return null;
  }
}

function mapApiKeySummary(record: typeof apikey.$inferSelect) {
  return {
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    start: record.start,
    enabled: record.enabled,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    metadata: parseApiKeyMetadata(record.metadata),
  };
}

export function createSettingsService(database: Database) {
  return {
    async listUserApiKeys(userId: string) {
      const apiKeys = await database
        .select()
        .from(apikey)
        .where(eq(apikey.referenceId, userId))
        .orderBy(desc(apikey.createdAt));

      return apiKeys.map(mapApiKeySummary);
    },

    async createUserApiKey(userId: string, input: CreateApiKeyBody) {
      const createdApiKey = await auth.api.createApiKey({
        body: {
          name: input.name,
          userId,
          expiresIn:
            input.expiryPreset === "90_days" ? NINETY_DAYS_IN_SECONDS : null,
          metadata: {
            createdBy: "settings",
          },
        },
      });

      const createdRecord = await database.query.apikey.findFirst({
        where: eq(apikey.id, createdApiKey.id),
      });

      if (!createdRecord) {
        throw new Error("API_KEY_CREATE_READBACK_FAILED");
      }

      return {
        apiKey: mapApiKeySummary(createdRecord),
        plainTextKey: createdApiKey.key,
      };
    },

    async revokeUserApiKey(userId: string, apiKeyId: string) {
      const [updatedRecord] = await database
        .update(apikey)
        .set({
          enabled: false,
        })
        .where(and(eq(apikey.id, apiKeyId), eq(apikey.referenceId, userId)))
        .returning();

      if (!updatedRecord) {
        return null;
      }

      return mapApiKeySummary(updatedRecord);
    },

    async revokeCurrentApiKey(token: string) {
      // verifyApiKey hashes the token internally and returns the matched record id
      const verified = await auth.api.verifyApiKey({
        body: { key: token },
      }).catch(() => null);

      if (!verified?.key?.id) return null;

      const [updatedRecord] = await database
        .update(apikey)
        .set({ enabled: false })
        .where(and(eq(apikey.id, verified.key.id), eq(apikey.enabled, true)))
        .returning();

      return updatedRecord ? mapApiKeySummary(updatedRecord) : null;
    },
  };
}
