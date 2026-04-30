import type { FastifyPluginAsync } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { role, user, userRole } from "../../db/schema";
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

const userParamsSchema = z.object({ userId: z.string().min(1) });
const setUserRoleBodySchema = z.object({
  role: z.enum(["admin", "user"]),
});

const adminRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.addHook("preHandler", (request, reply, done) => {
    assertSystemAdmin(fastify, request, reply).then(() => done()).catch(done);
  });

  const workspaceService = createWorkspaceService(fastify.db);
  const adminProjectService = createAdminProjectService(fastify.db);

  // --- User routes ---

  fastify.get("/users", async (_request, reply) => {
    const users = await fastify.db.query.user.findMany({
      orderBy: [asc(user.createdAt)],
      with: {
        userRoles: { with: { role: true } },
      },
    });

    const memberships = await fastify.db.query.workspaceMember.findMany({
      with: { workspace: true },
    });

    const membershipByUserId = new Map<string, typeof memberships>();
    for (const m of memberships) {
      const list = membershipByUserId.get(m.userId) ?? [];
      list.push(m);
      membershipByUserId.set(m.userId, list);
    }

    const result = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      systemRoles: u.userRoles.map((ur) => ur.role.name),
      workspaces: (membershipByUserId.get(u.id) ?? []).map((m) => ({
        id: m.workspaceId,
        name: m.workspace.name,
        plan: m.workspace.plan,
        role: m.role,
      })),
    }));

    return reply.success(result, 200, { count: result.length });
  });

  fastify.patch("/users/:userId/role", async (request, reply) => {
    const { userId } = userParamsSchema.parse(request.params);
    const { role: targetRoleName } = setUserRoleBodySchema.parse(request.body ?? {});

    const adminRoleRecord = await fastify.db.query.role.findFirst({
      where: eq(role.name, "admin"),
    });
    if (!adminRoleRecord) throw fastify.httpErrors.notFound("Admin role not found");

    if (targetRoleName === "admin") {
      await fastify.db
        .insert(userRole)
        .values({ userId, roleId: adminRoleRecord.id })
        .onConflictDoNothing();
    } else {
      await fastify.db
        .delete(userRole)
        .where(eq(userRole.userId, userId));
    }

    return reply.success({ userId, role: targetRoleName });
  });

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
