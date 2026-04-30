import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assertSystemAdmin } from "../../lib/admin-guard";
import { createAdminProjectService } from "../../modules/project/service.admin";
import {
  createProjectBodySchema,
  projectParamsSchema,
  updateProjectBodySchema,
} from "../../modules/project/schema";
import { createWorkspaceService } from "../../modules/workspace/service";
import {
  setPlanBodySchema,
  workspaceParamsSchema,
} from "../../modules/workspace/schema";

const adminListProjectsQuerySchema = z.object({
  workspaceId: z.uuid().optional(),
  ownerUserId: z.string().optional(),
});

const adminRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.addHook("preHandler", (request, reply, done) => {
    assertSystemAdmin(fastify, request, reply).then(() => done()).catch(done);
  });

  const workspaceService = createWorkspaceService(fastify.db);
  const adminProjectService = createAdminProjectService(fastify.db);

  // --- Workspace routes ---

  fastify.patch("/workspaces/:workspaceId/plan", async (request, reply) => {
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const { plan } = setPlanBodySchema.parse(request.body ?? {});

    const updated = await workspaceService.setWorkspacePlan(workspaceId, plan);
    if (!updated) throw fastify.httpErrors.notFound("Workspace not found");

    return reply.success(updated);
  });

  // --- Project routes ---

  fastify.get("/projects", async (request, reply) => {
    const query = adminListProjectsQuerySchema.parse(request.query ?? {});
    const projects = await adminProjectService.listProjects(query);
    return reply.success(projects, 200, { count: projects.length });
  });

  fastify.post("/projects", async (request, reply) => {
    const adminUserId = request.session!.user.id;
    const body = createProjectBodySchema.parse(request.body ?? {});
    const created = await adminProjectService.createProject(adminUserId, body);
    return reply.success(created, 201);
  });

  fastify.get("/projects/:projectId", async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const found = await adminProjectService.getProject(projectId);
    if (!found) throw fastify.httpErrors.notFound("Project not found");
    return reply.success(found);
  });

  fastify.patch("/projects/:projectId", async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = updateProjectBodySchema.parse(request.body ?? {});
    const updated = await adminProjectService.updateProject(projectId, body);
    if (!updated) throw fastify.httpErrors.notFound("Project not found");
    return reply.success(updated);
  });

  fastify.delete("/projects/:projectId", async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const deleted = await adminProjectService.deleteProject(projectId);
    if (!deleted) throw fastify.httpErrors.notFound("Project not found");
    return reply.success(deleted);
  });
};

export default adminRoutes;
