import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../../db/schema";
import { userGithubConnection } from "../../db/schema/github-schema";

const OAUTH_STATE_TTL_SECONDS = 600; // 10 minutes
const GITHUB_STATE_KEY_PREFIX = "github:oauth:state:";

type Db = PostgresJsDatabase<typeof schema>;

type GithubTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
};

type GithubUser = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
};

type GithubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string | null;
  html_url: string;
  owner: {
    login: string;
  };
};

export function createGithubService(
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
      throw new Error("GitHub OAuth credentials are not configured on this server");
    }
    return config;
  }

  function requireRedis() {
    if (!redis) {
      throw new Error("Redis is not configured on this server");
    }

    return redis;
  }
  // ── OAuth state helpers ────────────────────────────────────────────────────

  async function createOAuthState(userId: string): Promise<string> {
    const redisClient = requireRedis();
    const state = randomUUID();
    await redisClient.setex(
      `${GITHUB_STATE_KEY_PREFIX}${state}`,
      OAUTH_STATE_TTL_SECONDS,
      userId,
    );
    return state;
  }

  async function consumeOAuthState(state: string): Promise<string | null> {
    const redisClient = requireRedis();
    const key = `${GITHUB_STATE_KEY_PREFIX}${state}`;
    const userId = await redisClient.get(key);
    if (userId) {
      await redisClient.del(key);
    }
    return userId;
  }

  // ── GitHub API helpers ─────────────────────────────────────────────────────

  async function exchangeCodeForToken(code: string): Promise<GithubTokenResponse> {
    const c = requireConfig();
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        code,
        redirect_uri: c.callbackUrl,
      }),
    });

    if (!res.ok) {
      throw new Error(`GitHub token exchange failed: ${res.status}`);
    }

    const data = (await res.json()) as GithubTokenResponse & { error?: string };

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error}`);
    }

    return data;
  }

  async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch GitHub user: ${res.status}`);
    }

    return res.json() as Promise<GithubUser>;
  }

  async function fetchGithubRepositories(accessToken: string) {
    const repositories: GithubRepository[] = [];
    let page = 1;

    while (page <= 4) {
      const url = new URL("https://api.github.com/user/repos");
      url.searchParams.set("affiliation", "owner,collaborator,organization_member");
      url.searchParams.set("sort", "updated");
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", `${page}`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch GitHub repositories: ${response.status}`);
      }

      const data = (await response.json()) as GithubRepository[];
      repositories.push(...data);

      if (data.length < 100) {
        break;
      }

      page += 1;
    }

    return repositories;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    buildConnectUrl(userId: string, state: string): string {
      const c = requireConfig();
      const params = new URLSearchParams({
        client_id: c.clientId,
        redirect_uri: c.callbackUrl,
        scope: "repo,user:email",
        state,
      });
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    },

    async generateConnectUrl(userId: string): Promise<string> {
      const state = await createOAuthState(userId);
      return this.buildConnectUrl(userId, state);
    },

    async handleCallback(
      code: string,
      state: string,
    ): Promise<{ userId: string; githubLogin: string }> {
      const userId = await consumeOAuthState(state);

      if (!userId) {
        throw new Error("INVALID_OR_EXPIRED_STATE");
      }

      const tokenData = await exchangeCodeForToken(code);
      const githubUser = await fetchGithubUser(tokenData.access_token);

      await db
        .insert(userGithubConnection)
        .values({
          id: randomUUID(),
          userId,
          githubUserId: githubUser.id,
          githubLogin: githubUser.login,
          accessToken: tokenData.access_token,
          tokenType: tokenData.token_type,
          scope: tokenData.scope,
        })
        .onConflictDoUpdate({
          target: userGithubConnection.userId,
          set: {
            githubUserId: githubUser.id,
            githubLogin: githubUser.login,
            accessToken: tokenData.access_token,
            tokenType: tokenData.token_type,
            scope: tokenData.scope,
            updatedAt: new Date(),
          },
        });

      return { userId, githubLogin: githubUser.login };
    },

    async getConnection(userId: string) {
      return db.query.userGithubConnection.findFirst({
        where: eq(userGithubConnection.userId, userId),
      });
    },

    async disconnect(userId: string): Promise<boolean> {
      const result = await db
        .delete(userGithubConnection)
        .where(eq(userGithubConnection.userId, userId))
        .returning({ id: userGithubConnection.id });

      return result.length > 0;
    },

    async getAccessToken(userId: string): Promise<string | null> {
      const conn = await db.query.userGithubConnection.findFirst({
        where: eq(userGithubConnection.userId, userId),
        columns: { accessToken: true },
      });
      return conn?.accessToken ?? null;
    },

    async listAccessibleRepositories(
      userId: string,
      options?: {
        query?: string | null;
        limit?: number;
      },
    ) {
      const accessToken = await this.getAccessToken(userId);

      if (!accessToken) {
        throw new Error("GITHUB_NOT_CONNECTED");
      }

      const repositories = await fetchGithubRepositories(accessToken);
      const normalizedQuery = options?.query?.trim().toLowerCase();

      const filteredRepositories = normalizedQuery
        ? repositories.filter((repository) => {
            const haystacks = [
              repository.name,
              repository.full_name,
              repository.owner.login,
              repository.html_url,
            ];

            return haystacks.some((value) =>
              value.toLowerCase().includes(normalizedQuery),
            );
          })
        : repositories;

      return filteredRepositories
        .sort((left, right) => left.full_name.localeCompare(right.full_name))
        .slice(0, options?.limit ?? 25)
        .map((repository) => ({
          id: `${repository.id}`,
          name: repository.name,
          fullName: repository.full_name,
          ownerLogin: repository.owner.login,
          defaultBranch: repository.default_branch,
          private: repository.private,
          repositoryUrl: repository.html_url,
        }));
    },
  };
}

export type GithubService = ReturnType<typeof createGithubService>;
