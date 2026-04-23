import { FastifyPluginAsync } from "fastify";
import { createGithubController } from "../../modules/github/controller";

const githubRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = createGithubController(fastify);

  fastify.get("/status", controller.getStatus);
  fastify.get("/connect", controller.getConnectUrl);
  fastify.get("/callback", controller.handleCallback);
  fastify.delete("/disconnect", controller.disconnect);
};

export default githubRoutes;
