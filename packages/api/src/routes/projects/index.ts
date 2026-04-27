import { type FastifyPluginAsync, type FastifyRequest } from "fastify";
import type { IncomingMessage } from "node:http";
import { createProjectController } from "../../modules/project/controller";
import { createProjectUploadController } from "../../modules/project/controller.upload";

const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_REPARSE_BODY_SIZE = 10 * 1024 * 1024; // 10 MB — matches Gettext .po parse limit

const projectRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = createProjectController(fastify);
  const uploadController = createProjectUploadController(fastify);

  fastify.post("/", controller.createProject);
  fastify.post("/from-github", controller.createProjectFromGithub);

  // Upload route in its own encapsulated scope so the zip body parser
  // does not leak to other project routes.
  fastify.register(async (uploadScope) => {
    uploadScope.addContentTypeParser(
      "application/zip",
      { bodyLimit: MAX_UPLOAD_SIZE },
      async (_request: FastifyRequest, payload: IncomingMessage) => {
        const chunks: Buffer[] = [];
        for await (const chunk of payload) {
          chunks.push(chunk as Buffer);
        }
        return Buffer.concat(chunks);
      },
    );

    uploadScope.post("/from-upload", uploadController.createProjectFromUpload);
  });
  fastify.get("/", controller.listProjects);
  fastify.get("/:projectId", controller.getProjectById);
  fastify.get("/:projectId/map/files/content", controller.getProjectFileContent);
  fastify.get("/:projectId/map/files/parse", controller.getProjectFileParseData);
  fastify.post("/:projectId/map/files/reparse", { bodyLimit: MAX_REPARSE_BODY_SIZE }, controller.reparseProjectFile);
  fastify.get("/:projectId/map/files/raw", controller.getProjectRawFile);
  fastify.get("/:projectId/map/search", controller.searchProjectMap);
  fastify.get("/:projectId/map/edit-locations", controller.suggestEditLocations);
  fastify.get(
    "/:projectId/map/symbol-usages",
    controller.findProjectSymbolUsages,
  );
  fastify.get(
    "/:projectId/map/symbols/:symbolId/usages",
    controller.getProjectSymbolUsagesById,
  );
  fastify.get("/:projectId/map/diff", controller.getProjectDiff);
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
