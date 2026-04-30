import { and, asc, count, eq, gte, ne } from "drizzle-orm";
import type { db as dbType } from "../../db";
import {
  project,
  usageEvent,
  user,
  workspace,
  workspaceMember,
} from "../../db/schema";
import type {
  WorkspaceEntitlements,
  WorkspacePlan,
  WorkspaceRole,
  WorkspaceUsageSummary,
} from "@codemap/shared";
import type { CreateWorkspaceBody, UpdateWorkspaceBody } from "./schema";

type Database = typeof dbType;
type WorkspaceRecord = typeof workspace.$inferSelect;
type UsageEventType = typeof usageEvent.$inferInsert["type"];

function slugifyWorkspaceName(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function getWorkspaceEntitlements(
  workspaceRecord: Pick<WorkspaceRecord, "plan">,
): WorkspaceEntitlements {
  const plan = workspaceRecord.plan as WorkspacePlan;

  if (plan === "team") {
    return {
      plan,
      maxProjects: null,
      maxImportsPerMonth: null,
      maxIndexedFilesPerImport: null,
      privateRepoImports: true,
      mcpAccess: true,
    };
  }

  if (plan === "developer") {
    return {
      plan,
      maxProjects: 20,
      maxImportsPerMonth: 200,
      maxIndexedFilesPerImport: 50_000,
      privateRepoImports: true,
      mcpAccess: true,
    };
  }

  // beta = unlimited during early access
  return {
    plan,
    maxProjects: null,
    maxImportsPerMonth: null,
    maxIndexedFilesPerImport: null,
    privateRepoImports: true,
    mcpAccess: true,
  };
}

export function assertCanCreateProject(
  entitlements: WorkspaceEntitlements,
  usage: WorkspaceUsageSummary,
) {
  if (
    entitlements.maxProjects !== null &&
    usage.projectCount >= entitlements.maxProjects
  ) {
    throw new Error("WORKSPACE_PROJECT_LIMIT_EXCEEDED");
  }
}

export function assertCanTriggerImport(
  entitlements: WorkspaceEntitlements,
  usage: WorkspaceUsageSummary,
) {
  if (
    entitlements.maxImportsPerMonth !== null &&
    usage.importsThisMonth >= entitlements.maxImportsPerMonth
  ) {
    throw new Error("WORKSPACE_IMPORT_LIMIT_EXCEEDED");
  }
}

export function assertCanUseMcp(entitlements: WorkspaceEntitlements) {
  if (!entitlements.mcpAccess) {
    throw new Error("WORKSPACE_MCP_ACCESS_DISABLED");
  }
}

export function assertCanUsePrivateRepo(entitlements: WorkspaceEntitlements) {
  if (!entitlements.privateRepoImports) {
    throw new Error("WORKSPACE_PRIVATE_REPO_IMPORT_DISABLED");
  }
}

export function createWorkspaceService(database: Database) {
  async function ensureUniqueSlug(slug: string, excludeWorkspaceId?: string) {
    let candidate = slug;
    let suffix = 1;

    while (true) {
      const existing = await database.query.workspace.findFirst({
        where: excludeWorkspaceId
          ? and(eq(workspace.slug, candidate), ne(workspace.id, excludeWorkspaceId))
          : eq(workspace.slug, candidate),
        columns: { id: true },
      });

      if (!existing) return candidate;
      candidate = `${slug}-${suffix}`;
      suffix += 1;
    }
  }

  async function getMembership(userId: string, workspaceId: string) {
    return database.query.workspaceMember.findFirst({
      where: and(
        eq(workspaceMember.userId, userId),
        eq(workspaceMember.workspaceId, workspaceId),
      ),
    });
  }

  async function getDefaultPersonalWorkspace(userId: string) {
    return database.query.workspace.findFirst({
      where: and(
        eq(workspace.ownerUserId, userId),
        eq(workspace.type, "personal"),
      ),
      orderBy: [asc(workspace.createdAt)],
    });
  }

  async function ensurePersonalWorkspace(userId: string) {
    const existing = await getDefaultPersonalWorkspace(userId);
    if (existing) return existing;

    const userRecord = await database.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { id: true, name: true, email: true },
    });

    const baseName =
      userRecord?.name?.trim() || userRecord?.email?.trim() || "Personal workspace";
    const baseSlug = `personal-${slugifyWorkspaceName(baseName)}`;
    const slug = await ensureUniqueSlug(baseSlug);

    const [createdWorkspace] = await database.transaction(async (tx) => {
      const [newWorkspace] = await tx
        .insert(workspace)
        .values({
          name: baseName,
          slug,
          type: "personal",
          ownerUserId: userId,
          plan: "beta",
        })
        .returning();

      await tx.insert(workspaceMember).values({
        workspaceId: newWorkspace.id,
        userId,
        role: "owner",
      });

      return [newWorkspace];
    });

    return createdWorkspace;
  }

  async function getWorkspaceAccess(userId: string, workspaceId: string) {
    const membership = await getMembership(userId, workspaceId);
    if (!membership) return null;

    const workspaceRecord = await database.query.workspace.findFirst({
      where: eq(workspace.id, workspaceId),
    });

    if (!workspaceRecord) return null;
    return { workspace: workspaceRecord, membership };
  }

  async function assertWorkspaceRole(
    userId: string,
    workspaceId: string,
    roles: WorkspaceRole[],
  ) {
    const access = await getWorkspaceAccess(userId, workspaceId);
    if (!access || !roles.includes(access.membership.role as WorkspaceRole)) {
      return null;
    }

    return access;
  }

  async function getUsageSummary(workspaceId: string): Promise<WorkspaceUsageSummary> {
    const since = monthStart();

    const [projectCountRow] = await database
      .select({ value: count() })
      .from(project)
      .where(eq(project.workspaceId, workspaceId));

    const events = await database.query.usageEvent.findMany({
      where: and(eq(usageEvent.workspaceId, workspaceId), gte(usageEvent.createdAt, since)),
    });

    const totals = new Map<UsageEventType, number>();
    for (const event of events) {
      totals.set(event.type, (totals.get(event.type) ?? 0) + event.quantity);
    }

    const parseMetadata = events
      .filter((event) => event.type === "parse_completed")
      .map((event) =>
        event.metadataJson && typeof event.metadataJson === "object"
          ? (event.metadataJson as Record<string, unknown>)
          : {},
      );

    const sumMetadata = (key: string) =>
      parseMetadata.reduce((total, item) => {
        const value = item[key];
        return total + (typeof value === "number" ? value : 0);
      }, 0);

    return {
      projectCount: projectCountRow?.value ?? 0,
      importsThisMonth: totals.get("import_triggered") ?? 0,
      indexedFilesThisMonth: sumMetadata("indexedFileCount"),
      indexedSymbolsThisMonth: sumMetadata("indexedSymbolCount"),
      indexedEdgesThisMonth: sumMetadata("indexedEdgeCount"),
      mcpSessionsCreatedThisMonth: totals.get("mcp_session_created") ?? 0,
    };
  }

  async function recordUsageEvent(input: {
    workspaceId: string;
    projectId?: string | null;
    userId?: string | null;
    type: UsageEventType;
    quantity?: number;
    metadataJson?: Record<string, unknown> | null;
  }) {
    await database.insert(usageEvent).values({
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      userId: input.userId ?? null,
      type: input.type,
      quantity: input.quantity ?? 1,
      metadataJson: input.metadataJson ?? null,
    });
  }

  return {
    ensurePersonalWorkspace,
    getWorkspaceAccess,
    assertWorkspaceRole,
    getWorkspaceEntitlements,
    assertCanCreateProject,
    assertCanTriggerImport,
    assertCanUseMcp,
    assertCanUsePrivateRepo,
    getUsageSummary,
    recordUsageEvent,

    async listWorkspaces(userId: string) {
      const memberships = await database.query.workspaceMember.findMany({
        where: eq(workspaceMember.userId, userId),
        with: { workspace: true },
        orderBy: [asc(workspaceMember.createdAt)],
      });

      return memberships.map((membership) => ({
        workspace: membership.workspace,
        membership,
      }));
    },

    async getWorkspaceDetail(userId: string, workspaceId: string) {
      const access = await getWorkspaceAccess(userId, workspaceId);
      if (!access) return null;

      return {
        workspace: access.workspace,
        membership: access.membership,
        entitlements: getWorkspaceEntitlements(access.workspace),
        usage: await getUsageSummary(workspaceId),
      };
    },

    async createWorkspace(userId: string, input: CreateWorkspaceBody) {
      const baseSlug = slugifyWorkspaceName(input.slug ?? input.name);
      const slug = await ensureUniqueSlug(baseSlug);

      const [createdWorkspace] = await database.transaction(async (tx) => {
        const [newWorkspace] = await tx
          .insert(workspace)
          .values({
            name: input.name,
            slug,
            type: input.type,
            ownerUserId: userId,
            plan: "beta",
          })
          .returning();

        await tx.insert(workspaceMember).values({
          workspaceId: newWorkspace.id,
          userId,
          role: "owner",
        });

        return [newWorkspace];
      });

      return createdWorkspace;
    },

    async updateWorkspace(
      userId: string,
      workspaceId: string,
      input: UpdateWorkspaceBody,
    ) {
      const access = await getWorkspaceAccess(userId, workspaceId);
      if (!access) return null;
      if (!["owner", "admin"].includes(access.membership.role)) {
        throw new Error("WORKSPACE_ROLE_REQUIRED");
      }

      const [updatedWorkspace] = await database
        .update(workspace)
        .set({ name: input.name })
        .where(eq(workspace.id, workspaceId))
        .returning();

      return updatedWorkspace ?? null;
    },

    async setWorkspacePlan(workspaceId: string, plan: WorkspacePlan) {
      const [updated] = await database
        .update(workspace)
        .set({ plan })
        .where(eq(workspace.id, workspaceId))
        .returning();

      return updated ?? null;
    },

    async listMembers(userId: string, workspaceId: string) {
      const access = await getWorkspaceAccess(userId, workspaceId);
      if (!access) return null;

      return database.query.workspaceMember.findMany({
        where: eq(workspaceMember.workspaceId, workspaceId),
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: [asc(workspaceMember.createdAt)],
      });
    },
  };
}
