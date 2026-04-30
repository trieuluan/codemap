import { FastifyPluginAsync } from "fastify";
import { createSettingsController } from "../../modules/settings/controller";

const settingsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = createSettingsController(fastify);

  fastify.get("/api-keys", controller.listApiKeys);
  fastify.post("/api-keys", controller.createApiKey);
  fastify.post("/api-keys/:apiKeyId/revoke", controller.revokeApiKey);
  fastify.post("/api-keys/revoke-current", controller.revokeCurrentApiKey);
};

export default settingsRoutes;
