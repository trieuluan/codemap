import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

export default fp(async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError | ZodError, request, reply) => {
    request.log.error(error);

    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: error.flatten(),
        },
      });
    }

    const statusCode =
      typeof error.statusCode === "number" ? error.statusCode : 500;

    let code = "INTERNAL_ERROR";
    if (statusCode === 400) code = "BAD_REQUEST";
    else if (statusCode === 401) code = "UNAUTHORIZED";
    else if (statusCode === 403) code = "FORBIDDEN";
    else if (statusCode === 404) code = "NOT_FOUND";
    else if (statusCode === 409) code = "CONFLICT";

    return reply.code(statusCode).send({
      success: false,
      error: {
        code,
        message: error.message || "Something went wrong",
      },
    });
  });
});
