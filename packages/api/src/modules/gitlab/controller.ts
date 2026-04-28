import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createGitlabService, GitlabOAuthCallbackError } from "./service";
import {
  gitlabCallbackQuerySchema,
  gitlabConnectQuerySchema,
  gitlabRepositoriesQuerySchema,
} from "./schema";

function getGitlabConfig(fastify: FastifyInstance) {
  const clientId = process.env.GITLAB_CLIENT_ID;
  const clientSecret = process.env.GITLAB_CLIENT_SECRET;
  const callbackUrl =
    process.env.GITLAB_OAUTH_CALLBACK_URL ??
    `${process.env.BETTER_AUTH_URL}/gitlab/callback`;

  if (!clientId || !clientSecret) {
    throw fastify.httpErrors.internalServerError(
      "GitLab OAuth is not configured on this server",
    );
  }

  return { clientId, clientSecret, callbackUrl };
}

function getAuthenticatedUserId(fastify: FastifyInstance, request: FastifyRequest) {
  const userId = request.session?.user?.id;
  if (!userId) throw fastify.httpErrors.unauthorized("Unauthorized");
  return userId;
}

function getWebAppUrl() {
  return (
    process.env.WEB_APP_URL ??
    process.env.BETTER_AUTH_URL?.replace("://api.", "://").replace(":3001", ":3000") ??
    "http://localhost:3000"
  );
}

function normalizeSafeReturnTo(returnTo?: string | null) {
  if (!returnTo) return null;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  try {
    const parsed = new URL(returnTo, "http://codemap.local");
    if (parsed.origin !== "http://codemap.local") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function buildWebRedirect(webUrl: string, returnTo: string | null | undefined, params: Record<string, string>) {
  const baseUrl = webUrl.replace(/\/+$/, "");
  const target = normalizeSafeReturnTo(returnTo) ?? "/dashboard";
  const url = new URL(target, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function createGitlabController(fastify: FastifyInstance) {
  return {
    getStatus: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const service = createGitlabService(fastify.db, fastify.redis);
      const connection = await service.getConnection(userId);

      if (!connection) {
        return reply.success({ connected: false, gitlabLogin: null });
      }

      return reply.success({
        connected: true,
        gitlabLogin: connection.gitlabLogin,
        scope: connection.scope,
        connectedAt: connection.connectedAt,
      });
    },

    getConnectUrl: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const query = gitlabConnectQuerySchema.parse(request.query ?? {});
      const service = createGitlabService(fastify.db, fastify.redis, getGitlabConfig(fastify));
      const url = await service.generateConnectUrl(userId, {
        returnTo: normalizeSafeReturnTo(query.returnTo),
      });
      return reply.success({ url });
    },

    listRepositories: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const query = gitlabRepositoriesQuerySchema.parse(request.query ?? {});
      const service = createGitlabService(fastify.db, fastify.redis);

      try {
        const repositories = await service.listAccessibleRepositories(userId, {
          query: query.q,
          limit: query.limit,
        });
        return reply.success(repositories, 200, { count: repositories.length });
      } catch (error) {
        if (error instanceof Error && error.message === "GITLAB_NOT_CONNECTED") {
          throw fastify.httpErrors.conflict("GitLab account is not connected for this user");
        }
        throw error;
      }
    },

    handleCallback: async (request: FastifyRequest, reply: FastifyReply) => {
      const query = gitlabCallbackQuerySchema.safeParse(request.query ?? {});

      if (!query.success) {
        const webUrl = getWebAppUrl();
        return reply.redirect(buildWebRedirect(webUrl, null, { gitlab_error: "invalid_request" }));
      }

      const config = getGitlabConfig(fastify);
      const service = createGitlabService(fastify.db, fastify.redis, config);
      const webUrl = getWebAppUrl();

      try {
        const { gitlabLogin, returnTo } = await service.handleCallback(query.data.code, query.data.state);
        return reply.redirect(
          buildWebRedirect(webUrl, returnTo, { gitlab_connected: "1", login: gitlabLogin }),
        );
      } catch (error) {
        request.log.error({ error }, "GitLab OAuth callback failed");
        const message =
          error instanceof Error && error.message === "INVALID_OR_EXPIRED_STATE"
            ? "expired_state"
            : "token_exchange_failed";
        const returnTo = error instanceof GitlabOAuthCallbackError ? error.returnTo : null;
        return reply.redirect(buildWebRedirect(webUrl, returnTo, { gitlab_error: message }));
      }
    },

    disconnect: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const service = createGitlabService(fastify.db, fastify.redis);
      const removed = await service.disconnect(userId);
      if (!removed) throw fastify.httpErrors.notFound("No GitLab connection found");
      return reply.success({ disconnected: true });
    },
  };
}
