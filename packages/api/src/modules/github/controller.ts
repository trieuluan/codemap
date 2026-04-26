import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createGithubService, GithubOAuthCallbackError } from "./service";
import {
  githubCallbackQuerySchema,
  githubConnectQuerySchema,
  githubRepositoriesQuerySchema,
} from "./schema";

function getGithubConfig(fastify: FastifyInstance) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackUrl =
    process.env.GITHUB_OAUTH_CALLBACK_URL ??
    `${process.env.BETTER_AUTH_URL}/github/callback`;

  if (!clientId || !clientSecret) {
    throw fastify.httpErrors.internalServerError(
      "GitHub OAuth is not configured on this server",
    );
  }

  return { clientId, clientSecret, callbackUrl };
}

function getAuthenticatedUserId(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const userId = request.session?.user?.id;

  if (!userId) {
    throw fastify.httpErrors.unauthorized("Unauthorized");
  }

  return userId;
}

function getWebAppUrl() {
  return (
    process.env.WEB_APP_URL ??
    process.env.BETTER_AUTH_URL?.replace("://api.", "://").replace(
      ":3001",
      ":3000",
    ) ??
    "http://localhost:3000"
  );
}

function normalizeSafeReturnTo(returnTo?: string | null) {
  if (!returnTo) {
    return null;
  }

  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return null;
  }

  try {
    const parsed = new URL(returnTo, "http://codemap.local");
    if (parsed.origin !== "http://codemap.local") {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function buildWebRedirect(
  webUrl: string,
  returnTo: string | null | undefined,
  params: Record<string, string>,
) {
  const baseUrl = webUrl.replace(/\/+$/, "");
  const target = normalizeSafeReturnTo(returnTo) ?? "/dashboard";
  const url = new URL(target, baseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

export function createGithubController(fastify: FastifyInstance) {
  return {
    /**
     * GET /github/status
     * Returns whether the authenticated user has connected their GitHub account.
     */
    getStatus: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      // getStatus only reads the DB — no OAuth config needed
      const service = createGithubService(fastify.db, fastify.redis);

      const connection = await service.getConnection(userId);

      if (!connection) {
        return reply.success({ connected: false, githubLogin: null });
      }

      return reply.success({
        connected: true,
        githubLogin: connection.githubLogin,
        scope: connection.scope,
        connectedAt: connection.connectedAt,
      });
    },

    /**
     * GET /github/connect
     * Returns a GitHub OAuth URL the user should open in their browser.
     * The MCP uses this URL to guide the user through authorization.
     */
    getConnectUrl: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const query = githubConnectQuerySchema.parse(request.query ?? {});
      const service = createGithubService(
        fastify.db,
        fastify.redis,
        getGithubConfig(fastify),
      );

      const url = await service.generateConnectUrl(userId, {
        returnTo: normalizeSafeReturnTo(query.returnTo),
      });

      return reply.success({ url });
    },

    listRepositories: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const query = githubRepositoriesQuerySchema.parse(request.query ?? {});
      const service = createGithubService(fastify.db, fastify.redis);

      try {
        const repositories = await service.listAccessibleRepositories(userId, {
          query: query.q,
          limit: query.limit,
        });

        return reply.success(repositories, 200, {
          count: repositories.length,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "GITHUB_NOT_CONNECTED"
        ) {
          throw fastify.httpErrors.conflict(
            "GitHub account is not connected for this user",
          );
        }

        throw error;
      }
    },

    /**
     * GET /github/callback
     * GitHub redirects here after the user authorizes CodeMap.
     * Exchanges the code for an access token and stores the connection.
     * Redirects to the web app on success or failure.
     */
    handleCallback: async (request: FastifyRequest, reply: FastifyReply) => {
      const query = githubCallbackQuerySchema.safeParse(request.query ?? {});

      if (!query.success) {
        const webUrl = getWebAppUrl();
        return reply.redirect(
          buildWebRedirect(webUrl, null, { github_error: "invalid_request" }),
        );
      }

      const config = getGithubConfig(fastify);
      const service = createGithubService(fastify.db, fastify.redis, config);
      const webUrl = getWebAppUrl();

      try {
        const { githubLogin, returnTo } = await service.handleCallback(
          query.data.code,
          query.data.state,
        );

        return reply.redirect(
          buildWebRedirect(webUrl, returnTo, {
            github_connected: "1",
            login: githubLogin,
          }),
        );
      } catch (error) {
        request.log.error({ error }, "GitHub OAuth callback failed");

        const message =
          error instanceof Error && error.message === "INVALID_OR_EXPIRED_STATE"
            ? "expired_state"
            : "token_exchange_failed";
        const returnTo =
          error instanceof GithubOAuthCallbackError ? error.returnTo : null;

        return reply.redirect(
          buildWebRedirect(webUrl, returnTo, { github_error: message }),
        );
      }
    },

    /**
     * DELETE /github/disconnect
     * Removes the user's GitHub connection from CodeMap.
     */
    disconnect: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      // disconnect only writes to the DB — no OAuth config needed
      const service = createGithubService(fastify.db, fastify.redis);

      const removed = await service.disconnect(userId);

      if (!removed) {
        throw fastify.httpErrors.notFound("No GitHub connection found");
      }

      return reply.success({ disconnected: true });
    },
  };
}
