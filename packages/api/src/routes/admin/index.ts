import type { FastifyPluginAsync } from "fastify";
import { asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  project,
  projectImport,
  role,
  user,
  userRole,
  workspace,
  workspacePayment,
  workspaceSubscription,
} from "../../db/schema";
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

  fastify.get("/overview", async (_request, reply) => {
    const [
      userCount,
      workspaceCount,
      projectCount,
      importCount,
      activeSubscriptionCount,
    ] = await Promise.all([
      fastify.db.select({ value: count() }).from(user),
      fastify.db.select({ value: count() }).from(workspace),
      fastify.db.select({ value: count() }).from(project),
      fastify.db.select({ value: count() }).from(projectImport),
      fastify.db
        .select({ value: count() })
        .from(workspaceSubscription)
        .where(eq(workspaceSubscription.status, "active")),
    ]);

    const [workspaces, projects, imports, subscriptions, payments] =
      await Promise.all([
        fastify.db.query.workspace.findMany({
          orderBy: [desc(workspace.updatedAt), desc(workspace.createdAt)],
          limit: 8,
          with: {
            owner: true,
            members: true,
            projects: true,
            subscriptions: true,
          },
        }),
        fastify.db.query.project.findMany({
          orderBy: [desc(project.updatedAt), desc(project.createdAt)],
          limit: 8,
          with: {
            workspace: true,
            imports: {
              orderBy: [
                desc(projectImport.startedAt),
                desc(projectImport.createdAt),
              ],
              limit: 1,
            },
          },
        }),
        fastify.db.query.projectImport.findMany({
          orderBy: [desc(projectImport.startedAt), desc(projectImport.createdAt)],
          limit: 10,
          with: {
            project: {
              with: {
                workspace: true,
              },
            },
            triggeredByUser: true,
          },
        }),
        fastify.db.query.workspaceSubscription.findMany({
          orderBy: [
            desc(workspaceSubscription.updatedAt),
            desc(workspaceSubscription.createdAt),
          ],
          limit: 8,
          with: {
            workspace: true,
          },
        }),
        fastify.db.query.workspacePayment.findMany({
          orderBy: [desc(workspacePayment.createdAt)],
          limit: 8,
          with: {
            workspace: true,
          },
        }),
      ]);

    return reply.success({
      stats: {
        users: userCount[0]?.value ?? 0,
        workspaces: workspaceCount[0]?.value ?? 0,
        projects: projectCount[0]?.value ?? 0,
        imports: importCount[0]?.value ?? 0,
        activeSubscriptions: activeSubscriptionCount[0]?.value ?? 0,
      },
      workspaces: workspaces.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        type: row.type,
        plan: row.plan,
        owner: {
          id: row.owner.id,
          name: row.owner.name,
          email: row.owner.email,
        },
        memberCount: row.members.length,
        projectCount: row.projects.length,
        activeSubscription:
          row.subscriptions.find((sub) => sub.status === "active") ?? null,
        updatedAt: row.updatedAt,
      })),
      projects: projects.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        provider: row.provider,
        visibility: row.visibility,
        workspaceId: row.workspaceId,
        workspaceName: row.workspace.name,
        latestImport: row.imports[0] ?? null,
        updatedAt: row.updatedAt,
      })),
      imports: imports.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        projectName: row.project.name,
        workspaceId: row.project.workspaceId,
        workspaceName: row.project.workspace.name,
        triggeredBy: {
          id: row.triggeredByUser.id,
          name: row.triggeredByUser.name,
          email: row.triggeredByUser.email,
        },
        status: row.status,
        parseStatus: row.parseStatus,
        branch: row.branch,
        commitSha: row.commitSha,
        indexedFileCount: row.indexedFileCount,
        indexedSymbolCount: row.indexedSymbolCount,
        indexedEdgeCount: row.indexedEdgeCount,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
      })),
      subscriptions: subscriptions.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        workspaceName: row.workspace.name,
        plan: row.plan,
        provider: row.provider,
        status: row.status,
        currentPeriodEnd: row.currentPeriodEnd,
        updatedAt: row.updatedAt,
      })),
      payments: payments.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        workspaceName: row.workspace.name,
        provider: row.provider,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        plan: row.plan,
        createdAt: row.createdAt,
      })),
    });
  });

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

  fastify.get("/workspaces/:workspaceId", async (request, reply) => {
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    const found = await fastify.db.query.workspace.findFirst({
      where: eq(workspace.id, workspaceId),
      with: {
        owner: true,
        members: {
          with: {
            user: true,
          },
        },
        projects: {
          orderBy: [desc(project.updatedAt), desc(project.createdAt)],
          with: {
            imports: {
              orderBy: [
                desc(projectImport.startedAt),
                desc(projectImport.createdAt),
              ],
              limit: 1,
            },
          },
        },
        subscriptions: {
          orderBy: [
            desc(workspaceSubscription.updatedAt),
            desc(workspaceSubscription.createdAt),
          ],
        },
        payments: {
          orderBy: [desc(workspacePayment.createdAt)],
          limit: 12,
        },
      },
    });

    if (!found) throw fastify.httpErrors.notFound("Workspace not found");

    return reply.success({
      workspace: {
        id: found.id,
        name: found.name,
        slug: found.slug,
        type: found.type,
        plan: found.plan,
        owner: {
          id: found.owner.id,
          name: found.owner.name,
          email: found.owner.email,
        },
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
      },
      members: found.members.map((member) => ({
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
        user: {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          image: member.user.image,
        },
      })),
      projects: found.projects.map((projectRecord) => ({
        id: projectRecord.id,
        name: projectRecord.name,
        slug: projectRecord.slug,
        status: projectRecord.status,
        provider: projectRecord.provider,
        visibility: projectRecord.visibility,
        repositoryUrl: projectRecord.repositoryUrl,
        latestImport: projectRecord.imports[0] ?? null,
        updatedAt: projectRecord.updatedAt,
      })),
      subscriptions: found.subscriptions.map((subscription) => ({
        id: subscription.id,
        plan: subscription.plan,
        provider: subscription.provider,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelledAt: subscription.cancelledAt,
        updatedAt: subscription.updatedAt,
      })),
      payments: found.payments.map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        plan: payment.plan,
        createdAt: payment.createdAt,
      })),
    });
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
