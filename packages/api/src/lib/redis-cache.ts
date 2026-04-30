import type Redis from "ioredis";

export const CACHE_PREFIX = "codemap";

export const CACHE_VERSIONS = {
  projectInsights: "v2",
  mcpAuthSession: "v1",
} as const;

export const CACHE_NAMESPACES = {
  projectInsights: "project-insights",
  mcpAuthSession: "mcp-auth-session",
  githubOauthState: "github-oauth-state",
  gitlabOauthState: "gitlab-oauth-state",
} as const;

export type AppCacheNamespace = keyof Pick<
  typeof CACHE_NAMESPACES,
  "projectInsights"
>;

export const cacheKeys = {
  projectInsights(importId: string) {
    return [
      CACHE_PREFIX,
      CACHE_NAMESPACES.projectInsights,
      CACHE_VERSIONS.projectInsights,
      importId,
    ].join(":");
  },
  projectInsightsPattern(importId?: string) {
    return [
      CACHE_PREFIX,
      CACHE_NAMESPACES.projectInsights,
      CACHE_VERSIONS.projectInsights,
      importId ?? "*",
    ].join(":");
  },
  mcpAuthSessionPattern() {
    return "mcp:auth:session:*";
  },
  githubOauthStatePattern() {
    return "github:oauth:state:*";
  },
  gitlabOauthStatePattern() {
    return "gitlab:oauth:state:*";
  },
};

export const APP_CACHE_PATTERNS: Record<AppCacheNamespace, string> = {
  projectInsights: cacheKeys.projectInsightsPattern(),
};

export async function deleteByPattern(redis: Redis, pattern: string) {
  let cursor = "0";
  let deletedCount = 0;

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100,
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      deletedCount += await redis.del(...keys);
    }
  } while (cursor !== "0");

  return deletedCount;
}

export async function invalidateProjectImportCaches(
  redis: Redis,
  importId: string,
) {
  return {
    projectInsights: await deleteByPattern(
      redis,
      cacheKeys.projectInsightsPattern(importId),
    ),
  };
}
