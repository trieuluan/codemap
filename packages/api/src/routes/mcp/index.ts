import { FastifyPluginAsync } from "fastify";
import { createMcpController } from "../../modules/mcp/controller";

const mcpRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = createMcpController(fastify);

  fastify.post("/auth/start", controller.startAuth);
  fastify.get("/auth/status", controller.getAuthStatus);
  fastify.post("/auth/approve", controller.approveAuth);
  fastify.post("/auth/claim", controller.claimAuth);
  fastify.get("/auth/me", controller.getMe);
};

export default mcpRoutes;
