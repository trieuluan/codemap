import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../../db/schema";
import { userGitlabConnection } from "../../db/schema/gitlab-schema";

const OAUTH_STATE_TTL_SECONDS = 600;
const GITLAB_STATE_KEY_PREFIX = "gitlab:oauth:state:";
const GITLAB_BASE_URL = "https://gitlab.com";

type Db = PostgresJsDatabase<typeof schema>;

type GitlabTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
};

type GitlabUser = {
  id: number;
  username: string;
  name: string | null;
  email: string | null;
};

type GitlabRepository = {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string | null;
  web_url: string;
  visibility: string;
  namespace: {
    path: string;
  };
};

interface GitlabOAuthState {
  userId: string;
  returnTo: string | null;
}

export class GitlabOAuthCallbackError extends Error {
  returnTo: string | null;

  constructor(message: string, returnTo?: string | null) {
    super(message);
    this.name = "GitlabOAuthCallbackError";
    this.returnTo = returnTo ?? null;
  }
}

export function createGitlabService(
  db: Db,
  redis: Redis | null,
  config?: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  },
) {
  function requireConfig() {
    if (!config) {
      throw new Error(
        "GitLab OAuth credentials are not configured on this server",
      );
    }
    return config;
  }

  function requireRedis() {
    if (!redis) {
      throw new Error("Redis is not configured on this server");
    }
    return redis;
  }

  async function createOAuthState(
    userId: string,
    returnTo?: string | null,
  ): Promise<string> {
    const redisClient = requireRedis();
    const state = randomUUID();
    const value: GitlabOAuthState = { userId, returnTo: returnTo ?? null };
    await redisClient.setex(
      `${GITLAB_STATE_KEY_PREFIX}${state}`,
      OAUTH_STATE_TTL_SECONDS,
      JSON.stringify(value),
    );
    return state;
  }

  async function consumeOAuthState(
    state: string,
  ): Promise<GitlabOAuthState | null> {
    const redisClient = requireRedis();
    const key = `${GITLAB_STATE_KEY_PREFIX}${state}`;
    const rawState = await redisClient.get(key);
    if (rawState) await redisClient.del(key);
    if (!rawState) return null;

    try {
      const parsed = JSON.parse(rawState) as Partial<GitlabOAuthState>;
      if (typeof parsed.userId === "string") {
        return {
          userId: parsed.userId,
          returnTo:
            typeof parsed.returnTo === "string" ? parsed.returnTo : null,
        };
      }
    } catch {
      return { userId: rawState, returnTo: null };
    }

    return { userId: rawState, returnTo: null };
  }

  async function exchangeCodeForToken(
    code: string,
  ): Promise<GitlabTokenResponse> {
    const c = requireConfig();
    const body = new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: c.callbackUrl,
    });

    const res = await fetch(`${GITLAB_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`GitLab token exchange failed: ${res.status}`);
    }

    const data = (await res.json()) as GitlabTokenResponse & { error?: string };
    if (data.error) throw new Error(`GitLab OAuth error: ${data.error}`);
    return data;
  }

  async function fetchGitlabUser(accessToken: string): Promise<GitlabUser> {
    const res = await fetch(`${GITLAB_BASE_URL}/api/v4/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch GitLab user: ${res.status}`);
    return res.json() as Promise<GitlabUser>;
  }

  async function fetchGitlabRepositories(accessToken: string) {
    const repositories: GitlabRepository[] = [];
    let page = 1;

    while (page <= 4) {
      const url = new URL(`${GITLAB_BASE_URL}/api/v4/projects`);
      url.searchParams.set("membership", "true");
      url.searchParams.set("order_by", "last_activity_at");
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", `${page}`);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok)
        throw new Error(
          `Failed to fetch GitLab repositories: ${response.status}`,
        );

      const data = (await response.json()) as GitlabRepository[];
      repositories.push(...data);
      if (data.length < 100) break;
      page += 1;
    }

    return repositories;
  }

  return {
    buildConnectUrl(userId: string, state: string): string {
      const c = requireConfig();
      // Build manually to avoid URLSearchParams encoding spaces as + (GitLab requires %20)
      const params = [
        `client_id=${encodeURIComponent(c.clientId)}`,
        `redirect_uri=${encodeURIComponent(c.callbackUrl)}`,
        `response_type=code`,
        `scope=api%20read_repository%20read_user`,
        `state=${encodeURIComponent(state)}`,
      ].join("&");
      return `${GITLAB_BASE_URL}/oauth/authorize?${params}`;
    },

    async generateConnectUrl(
      userId: string,
      options?: { returnTo?: string | null },
    ): Promise<string> {
      const state = await createOAuthState(userId, options?.returnTo ?? null);
      return this.buildConnectUrl(userId, state);
    },

    async handleCallback(
      code: string,
      state: string,
    ): Promise<{
      userId: string;
      gitlabLogin: string;
      returnTo: string | null;
    }> {
      const oauthState = await consumeOAuthState(state);
      if (!oauthState) throw new Error("INVALID_OR_EXPIRED_STATE");

      try {
        const tokenData = await exchangeCodeForToken(code);
        const gitlabUser = await fetchGitlabUser(tokenData.access_token);

        await db
          .insert(userGitlabConnection)
          .values({
            id: randomUUID(),
            userId: oauthState.userId,
            gitlabUserId: gitlabUser.id,
            gitlabLogin: gitlabUser.username,
            accessToken: tokenData.access_token,
            tokenType: tokenData.token_type,
            scope: tokenData.scope,
          })
          .onConflictDoUpdate({
            target: userGitlabConnection.userId,
            set: {
              gitlabUserId: gitlabUser.id,
              gitlabLogin: gitlabUser.username,
              accessToken: tokenData.access_token,
              tokenType: tokenData.token_type,
              scope: tokenData.scope,
              updatedAt: new Date(),
            },
          });

        return {
          userId: oauthState.userId,
          gitlabLogin: gitlabUser.username,
          returnTo: oauthState.returnTo,
        };
      } catch (error) {
        throw new GitlabOAuthCallbackError(
          error instanceof Error ? error.message : "GITLAB_CALLBACK_FAILED",
          oauthState.returnTo,
        );
      }
    },

    async getConnection(userId: string) {
      return db.query.userGitlabConnection.findFirst({
        where: eq(userGitlabConnection.userId, userId),
      });
    },

    async disconnect(userId: string): Promise<boolean> {
      const result = await db
        .delete(userGitlabConnection)
        .where(eq(userGitlabConnection.userId, userId))
        .returning({ id: userGitlabConnection.id });
      return result.length > 0;
    },

    async getAccessToken(userId: string): Promise<string | null> {
      const conn = await db.query.userGitlabConnection.findFirst({
        where: eq(userGitlabConnection.userId, userId),
        columns: { accessToken: true },
      });
      return conn?.accessToken ?? null;
    },

    async listAccessibleRepositories(
      userId: string,
      options?: { query?: string | null; limit?: number },
    ) {
      const accessToken = await this.getAccessToken(userId);
      if (!accessToken) throw new Error("GITLAB_NOT_CONNECTED");

      const repositories = await fetchGitlabRepositories(accessToken);
      const normalizedQuery = options?.query?.trim().toLowerCase();

      const filtered = normalizedQuery
        ? repositories.filter((repo) =>
            [repo.name, repo.path_with_namespace, repo.web_url].some((v) =>
              v.toLowerCase().includes(normalizedQuery),
            ),
          )
        : repositories;

      return filtered
        .sort((a, b) =>
          a.path_with_namespace.localeCompare(b.path_with_namespace),
        )
        .slice(0, options?.limit ?? 25)
        .map((repo) => ({
          id: `${repo.id}`,
          name: repo.name,
          fullName: repo.path_with_namespace,
          ownerLogin: repo.namespace.path,
          defaultBranch: repo.default_branch,
          private: repo.visibility !== "public",
          repositoryUrl: repo.web_url,
        }));
    },
  };
}

export type GitlabService = ReturnType<typeof createGitlabService>;
