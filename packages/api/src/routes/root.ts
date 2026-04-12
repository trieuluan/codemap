import { FastifyPluginAsync } from "fastify";

const root: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get("/", async function (request, reply) {
    return { root: true };
  });

  // Protected route example
  // fastify.get('/protected', {
  //   preHandler: fastify.authGuard(),
  // }, async function (request, reply) {
  //   return {
  //     message: 'This is a protected route',
  //     user: request.auth,
  //   }
  // })
};

export default root;
