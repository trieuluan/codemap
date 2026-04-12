import type { FastifyInstance } from "fastify";

export default async function authRoutes(fastify: FastifyInstance) {
  //   const authController = buildAuthController(fastify);

  //   fastify.register(async function authRoutes(fastify) {

  //   fastify.post('/register', {
  //     schema: {
  //       body: {
  //         type: 'object',
  //         properties: {
  //           email: { type: 'string', format: 'email' },
  //           password: { type: 'string', minLength: 6 },
  //           name: { type: 'string', minLength: 1 },
  //         },
  //         required: ['email', 'password', 'name'],
  //       },
  //     },
  //   }, authController.register);

  //   fastify.post('/login', {
  //     schema: {
  //       body: {
  //         type: 'object',
  //         properties: {
  //           email: { type: 'string', format: 'email' },
  //           password: { type: 'string', minLength: 6 },
  //         },
  //         required: ['email', 'password'],
  //       },
  //     },
  //   }, authController.login);

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

    return reply.success({
      user: request.session.user,
      session: request.session.session,
    });
  });

  //   fastify.post('/logout', {
  //     preHandler: fastify.authGuard(),
  //   }, authController.logout);
  //   }, { prefix: '/auth' });
}
