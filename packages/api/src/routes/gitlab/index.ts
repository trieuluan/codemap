import { FastifyPluginAsync } from "fastify";
import { createGitlabController } from "../../modules/gitlab/controller";

const gitlabRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = createGitlabController(fastify);

  fastify.get("/status", controller.getStatus);
  fastify.get("/connect", controller.getConnectUrl);
  fastify.get("/repositories", controller.listRepositories);
  fastify.get("/callback", controller.handleCallback);
  fastify.delete("/disconnect", controller.disconnect);
};

export default gitlabRoutes;
