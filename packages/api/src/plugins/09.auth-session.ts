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

    requestWithSession.session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
  });
});
