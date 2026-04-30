import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { role, userRole } from "../db/schema";

export async function assertSystemAdmin(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.session?.user?.id;

  if (!userId) {
    return reply.code(401).send({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  }

  const adminRole = await fastify.db.query.role.findFirst({
    where: eq(role.name, "admin"),
    columns: { id: true },
  });

  if (!adminRole) {
    return reply.code(403).send({
      success: false,
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });
  }

  const assignment = await fastify.db.query.userRole.findFirst({
    where: and(eq(userRole.userId, userId), eq(userRole.roleId, adminRole.id)),
    columns: { userId: true },
  });

  if (!assignment) {
    return reply.code(403).send({
      success: false,
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });
  }
}
