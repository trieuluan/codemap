import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createWorkspaceService } from "./service";
import { z } from "zod";
import {
  createWorkspaceBodySchema,
  updateWorkspaceBodySchema,
  workspaceParamsSchema,
} from "./schema";

function getAuthenticatedUserId(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const userId = request.session?.user?.id;
  if (!userId) throw fastify.httpErrors.unauthorized("Unauthorized");
  return userId;
}

export function createWorkspaceController(fastify: FastifyInstance) {
  const service = createWorkspaceService(fastify.db);

  return {
    listWorkspaces: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const workspaces = await service.listWorkspaces(userId);
      return reply.success(workspaces, 200, { count: workspaces.length });
    },

    createWorkspace: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const body = createWorkspaceBodySchema.parse(request.body ?? {});
      const workspace = await service.createWorkspace(userId, body);
      return reply.success(workspace, 201);
    },

    getWorkspace: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const params = workspaceParamsSchema.parse(request.params);
      const detail = await service.getWorkspaceDetail(userId, params.workspaceId);
      if (!detail) throw fastify.httpErrors.notFound("Workspace not found");
      return reply.success(detail);
    },

    updateWorkspace: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const params = workspaceParamsSchema.parse(request.params);
      const body = updateWorkspaceBodySchema.parse(request.body ?? {});
      let updated;
      try {
        updated = await service.updateWorkspace(userId, params.workspaceId, body);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "WORKSPACE_ROLE_REQUIRED"
        ) {
          throw fastify.httpErrors.forbidden(
            "Workspace owner or admin role required",
          );
        }
        throw error;
      }
      if (!updated) throw fastify.httpErrors.notFound("Workspace not found");
      return reply.success(updated);
    },

    listMembers: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const params = workspaceParamsSchema.parse(request.params);
      const members = await service.listMembers(userId, params.workspaceId);
      if (!members) throw fastify.httpErrors.notFound("Workspace not found");
      return reply.success(members, 200, { count: members.length });
    },

    getUsage: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const params = workspaceParamsSchema.parse(request.params);
      const detail = await service.getWorkspaceDetail(userId, params.workspaceId);
      if (!detail) throw fastify.httpErrors.notFound("Workspace not found");
      return reply.success(detail.usage);
    },

    inviteMember: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const params = workspaceParamsSchema.parse(request.params);
      const { email } = z.object({ email: z.string().email() }).parse(request.body ?? {});

      try {
        const result = await service.inviteMember(userId, params.workspaceId, email);
        if (!result) throw fastify.httpErrors.notFound("Workspace not found");
        return reply.success(result, 201);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.message === "WORKSPACE_ROLE_REQUIRED")
          throw fastify.httpErrors.forbidden("Workspace owner or admin role required");
        if (error.message === "WORKSPACE_TEAM_MEMBERS_DISABLED")
          throw fastify.httpErrors.forbidden("Team members feature requires a Team plan");
        if (error.message === "USER_NOT_FOUND")
          throw fastify.httpErrors.notFound("No account found with that email address");
        if (error.message === "ALREADY_MEMBER")
          throw fastify.httpErrors.conflict("This user is already a member of the workspace");
        throw error;
      }
    },

    removeMember: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { workspaceId, memberId } = z
        .object({ workspaceId: z.string(), memberId: z.string() })
        .parse(request.params);

      try {
        const result = await service.removeMember(userId, workspaceId, memberId);
        if (!result) throw fastify.httpErrors.notFound("Member not found");
        return reply.success({ removed: true });
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.message === "WORKSPACE_ROLE_REQUIRED")
          throw fastify.httpErrors.forbidden("Workspace owner or admin role required");
        if (error.message === "CANNOT_REMOVE_OWNER")
          throw fastify.httpErrors.forbidden("Cannot remove the workspace owner");
        throw error;
      }
    },
  };
}
