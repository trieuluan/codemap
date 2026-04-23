import { FastifyPluginAsync } from "fastify";
import { createProjectController } from "../../modules/project/controller";

const projectRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = createProjectController(fastify);

  fastify.post("/", controller.createProject);
  fastify.post("/from-workspace", controller.createProjectFromWorkspace);
  fastify.post("/from-github", controller.createProjectFromGithub);
  fastify.get("/", controller.listProjects);
  fastify.get("/:projectId", controller.getProjectById);
  fastify.get("/:projectId/map/files/content", controller.getProjectFileContent);
  fastify.get("/:projectId/map/files/parse", controller.getProjectFileParseData);
  fastify.get("/:projectId/map/files/outline", controller.getProjectFileOutline);
  fastify.get("/:projectId/map/files/raw", controller.getProjectRawFile);
  fastify.get("/:projectId/map/search", controller.searchProjectMap);
  fastify.get("/:projectId/map/analysis", controller.getProjectAnalysis);
  fastify.get("/:projectId/map/insights", controller.getProjectInsights);
  fastify.get("/:projectId/map/graph", controller.getProjectGraph);
  fastify.get("/:projectId/map", controller.getProjectMap);
  fastify.patch("/:projectId", controller.updateProject);
  fastify.delete("/:projectId", controller.deleteProject);
  fastify.post("/:projectId/import", controller.createImport);
  fastify.get("/:projectId/imports", controller.listImports);
};

export default projectRoutes;
