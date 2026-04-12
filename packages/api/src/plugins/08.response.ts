import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply } from "fastify";

export type SuccessMeta = Record<string, unknown>;

export default fp(async (fastify: FastifyInstance) => {
  fastify.decorateReply("success", function <
    T,
  >(this: FastifyReply, data: T, statusCode = 200, meta?: SuccessMeta) {
    return this.code(statusCode).send({
      success: true,
      data,
      ...(meta ? { meta } : {}),
    });
  });
});
