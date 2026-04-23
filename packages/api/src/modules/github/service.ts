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

export function createGithubService(
  db: Db,
  redis: Redis,
  config: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  },
) {
  // ── OAuth state helpers ────────────────────────────────────────────────────

  async function createOAuthState(userId: string): Promise<string> {
    const state = randomUUID();
    await redis.setex(
      `${GITHUB_STATE_KEY_PREFIX}${state}`,
      OAUTH_STATE_TTL_SECONDS,
      userId,
    );
    return state;
  }

  async function consumeOAuthState(state: string): Promise<string | null> {
    const key = `${GITHUB_STATE_KEY_PREFIX}${state}`;
    const userId = await redis.get(key);
    if (userId) {
      await redis.del(key);
    }
    return userId;
  }

  // ── GitHub API helpers ─────────────────────────────────────────────────────

  async function exchangeCodeForToken(code: string): Promise<GithubTokenResponse> {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
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

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    buildConnectUrl(userId: string, state: string): string {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.callbackUrl,
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
  };
}

export type GithubService = ReturnType<typeof createGithubService>;
