import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { userRole } from "../../db/schema";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.get("/me", async (request, reply) => {
    if (!request.session) {
      return reply.code(401).send({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
        },
      });
    }

    const userId = request.session.user.id;

    const assignments = await fastify.db.query.userRole.findMany({
      where: eq(userRole.userId, userId),
      with: { role: { columns: { name: true } } },
    });

    const roles = assignments.map((a) => a.role.name);

    return reply.success({
      user: request.session.user,
      session: request.session.session,
      roles,
    });
  });
}
