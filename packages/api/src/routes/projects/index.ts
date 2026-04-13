import { FastifyPluginAsync } from "fastify";
import { createProjectController } from "../../modules/project/controller";

const projectRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = createProjectController(fastify);

  fastify.post("/", controller.createProject);
  fastify.get("/", controller.listProjects);
  fastify.get("/:projectId", controller.getProjectById);
  fastify.get("/:projectId/map/files/content", controller.getProjectFileContent);
  fastify.get("/:projectId/map/files/raw", controller.getProjectRawFile);
  fastify.get("/:projectId/map", controller.getProjectMap);
  fastify.patch("/:projectId", controller.updateProject);
  fastify.delete("/:projectId", controller.deleteProject);
  fastify.post("/:projectId/import", controller.createImport);
  fastify.post("/:projectId/imports/:importId/retry", controller.retryImport);
  fastify.get("/:projectId/imports", controller.listImports);
};

export default projectRoutes;
