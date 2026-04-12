import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { FastifyInstance } from "fastify";

export default fp(async (fastify: FastifyInstance) => {
  const { CORS_ORIGIN } = (
    fastify as FastifyInstance & { config: { CORS_ORIGIN: string } }
  ).config;
  const origin =
    CORS_ORIGIN === "*"
      ? true
      : CORS_ORIGIN.split(",").map((item: string) => item.trim());
  await fastify.register(cors, {
    origin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });
});
