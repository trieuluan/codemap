import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createMcpService } from "./service";
import {
  approveMcpAuthBodySchema,
  claimMcpAuthBodySchema,
  mcpAuthSessionQuerySchema,
  startMcpAuthBodySchema,
} from "./schema";

function getAuthenticatedUser(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const user = request.session?.user;

  if (!user) {
    throw fastify.httpErrors.unauthorized("Unauthorized");
  }

  return user;
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

export function createMcpController(fastify: FastifyInstance) {
  const service = createMcpService(
    fastify.redis,
    getWebAppUrl(),
    process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  );

  return {
    startAuth: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = startMcpAuthBodySchema.parse(request.body ?? {});
      const session = await service.startAuthSession(body);
      return reply.success(session, 201);
    },

    getAuthStatus: async (request: FastifyRequest, reply: FastifyReply) => {
      const query = mcpAuthSessionQuerySchema.parse(request.query ?? {});
      const status = await service.getAuthSessionStatus(query.sessionId);
      return reply.success(status);
    },

    approveAuth: async (request: FastifyRequest, reply: FastifyReply) => {
      const user = getAuthenticatedUser(fastify, request);
      const body = approveMcpAuthBodySchema.parse(request.body ?? {});

      try {
        const session = await service.approveAuthSession(body.sessionId, {
          id: user.id,
          email: user.email,
          name: user.name,
        });

        return reply.success({
          approved: true,
          sessionId: session.sessionId,
          user: session.user,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "MCP_AUTH_SESSION_NOT_FOUND"
        ) {
          throw fastify.httpErrors.notFound("MCP auth session not found");
        }

        if (
          error instanceof Error &&
          error.message === "MCP_AUTH_SESSION_EXPIRED"
        ) {
          throw fastify.httpErrors.gone("MCP auth session has expired");
        }

        throw error;
      }
    },

    claimAuth: async (request: FastifyRequest, reply: FastifyReply) => {
      const body = claimMcpAuthBodySchema.parse(request.body ?? {});

      try {
        const result = await service.claimAuthSession(body.sessionId);
        return reply.success(result);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "MCP_AUTH_SESSION_NOT_FOUND"
        ) {
          throw fastify.httpErrors.notFound("MCP auth session not found");
        }

        if (
          error instanceof Error &&
          error.message === "MCP_AUTH_SESSION_EXPIRED"
        ) {
          throw fastify.httpErrors.gone("MCP auth session has expired");
        }

        if (
          error instanceof Error &&
          error.message === "MCP_AUTH_SESSION_NOT_AUTHORIZED"
        ) {
          throw fastify.httpErrors.conflict(
            "MCP auth session is not authorized yet",
          );
        }

        if (
          error instanceof Error &&
          error.message === "MCP_AUTH_SESSION_ALREADY_CLAIMED"
        ) {
          throw fastify.httpErrors.conflict(
            "MCP auth API key has already been claimed",
          );
        }

        throw error;
      }
    },

    getMe: async (request: FastifyRequest, reply: FastifyReply) => {
      const user = getAuthenticatedUser(fastify, request);

      return reply.success({
        authenticated: true,
        apiUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    },
  };
}
