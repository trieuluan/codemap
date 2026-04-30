import { type FastifyPluginAsync } from "fastify";
import { createWorkspaceController } from "../../modules/workspace/controller";

const workspaceRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = createWorkspaceController(fastify);

  fastify.get("/", controller.listWorkspaces);
  fastify.post("/", controller.createWorkspace);
  fastify.get("/:workspaceId", controller.getWorkspace);
  fastify.patch("/:workspaceId", controller.updateWorkspace);
  fastify.get("/:workspaceId/members", controller.listMembers);
  fastify.get("/:workspaceId/usage", controller.getUsage);
};

export default workspaceRoutes;
