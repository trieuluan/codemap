import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";

export default fp(async function authSessionPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest("session", null);

  fastify.addHook("preHandler", async (request: FastifyRequest) => {
    const requestWithSession = request as FastifyRequest & {
      session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
    };

    try {
      requestWithSession.session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
    } catch {
      // An invalid/expired API key in headers should not block requests
      // to public endpoints (e.g. /mcp/auth/start for login).
      // Treat lookup failures as unauthenticated.
      requestWithSession.session = null;
    }
  });
});
