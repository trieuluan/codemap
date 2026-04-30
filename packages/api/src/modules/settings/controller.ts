import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createSettingsService } from "./service";
import { createApiKeyBodySchema, revokeApiKeyParamsSchema } from "./schema";

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

export function createSettingsController(fastify: FastifyInstance) {
  const service = createSettingsService(fastify.db);

  return {
    listApiKeys: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const apiKeys = await service.listUserApiKeys(userId);

      return reply.success(apiKeys, 200, {
        count: apiKeys.length,
      });
    },

    createApiKey: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const body = createApiKeyBodySchema.parse(request.body ?? {});

      try {
        const result = await service.createUserApiKey(userId, body);
        return reply.success(result, 201);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "API_KEY_CREATE_READBACK_FAILED"
        ) {
          throw fastify.httpErrors.internalServerError(
            "API key was created but could not be loaded back.",
          );
        }

        throw error;
      }
    },

    revokeApiKey: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { apiKeyId } = revokeApiKeyParamsSchema.parse(request.params ?? {});
      const apiKey = await service.revokeUserApiKey(userId, apiKeyId);

      if (!apiKey) {
        throw fastify.httpErrors.notFound("API key not found");
      }

      return reply.success({
        revoked: true,
        apiKey,
      });
    },

    revokeCurrentApiKey: async (request: FastifyRequest, reply: FastifyReply) => {
      const token =
        (request.headers["x-api-key"] as string | undefined) ??
        (request.headers.authorization?.startsWith("Bearer ")
          ? request.headers.authorization.slice(7)
          : undefined);

      if (!token) {
        throw fastify.httpErrors.unauthorized("No API key provided");
      }

      const apiKey = await service.revokeCurrentApiKey(token);

      if (!apiKey) {
        // Key not found or already revoked — treat as success so logout is idempotent
        return reply.success({ revoked: true, apiKey: null });
      }

      return reply.success({ revoked: true, apiKey });
    },
  };
}
