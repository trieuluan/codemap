import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createGithubService } from "./service";
import { githubCallbackQuerySchema } from "./schema";

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
      const service = createGithubService(
        fastify.db,
        fastify.redis,
        getGithubConfig(fastify),
      );

      const url = await service.generateConnectUrl(userId);

      return reply.success({ url });
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
        const webUrl =
          process.env.BETTER_AUTH_URL?.replace(":3001", ":3000") ??
          "http://localhost:3000";
        return reply.redirect(
          `${webUrl}/dashboard?github_error=invalid_request`,
        );
      }

      const config = getGithubConfig(fastify);
      const service = createGithubService(fastify.db, fastify.redis, config);
      const webUrl =
        process.env.BETTER_AUTH_URL?.replace(":3001", ":3000") ??
        "http://localhost:3000";

      try {
        const { githubLogin } = await service.handleCallback(
          query.data.code,
          query.data.state,
        );

        return reply.redirect(
          `${webUrl}/dashboard?github_connected=1&login=${encodeURIComponent(githubLogin)}`,
        );
      } catch (error) {
        request.log.error({ error }, "GitHub OAuth callback failed");

        const message =
          error instanceof Error && error.message === "INVALID_OR_EXPIRED_STATE"
            ? "expired_state"
            : "token_exchange_failed";

        return reply.redirect(`${webUrl}/dashboard?github_error=${message}`);
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
