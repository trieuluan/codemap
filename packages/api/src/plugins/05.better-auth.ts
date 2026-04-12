import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";

export default fp(async function betterAuthPlugin(fastify: FastifyInstance) {
  fastify.route({
    method: ["GET", "POST"],
    url: "/auth/*",
    async handler(request, reply) {
      try {
        const origin =
          process.env.BETTER_AUTH_URL || `http://${request.headers.host}`;

        const url = new URL(request.url, origin);
        const headers = fromNodeHeaders(request.headers);

        const req = new Request(url.toString(), {
          method: request.method,
          headers,
          body: request.body ? JSON.stringify(request.body) : undefined,
        });

        const response = await auth.handler(req);

        reply.status(response.status);
        response.headers.forEach((value, key) => {
          reply.header(key, value);
        });

        const text = response.body ? await response.text() : null;
        return reply.send(text);
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          error: {
            code: "AUTH_FAILURE",
            message: "Internal authentication error",
          },
        });
      }
    },
  });
});
