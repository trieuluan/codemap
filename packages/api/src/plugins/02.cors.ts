import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { FastifyInstance } from "fastify";

export default fp(async (fastify: FastifyInstance) => {
  const { CORS_ORIGIN } = fastify.config;
  const origin =
    CORS_ORIGIN === "*"
      ? true
      : CORS_ORIGIN.split(",").map((item) => item.trim());
  await fastify.register(cors, {
    origin: origin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });
});
