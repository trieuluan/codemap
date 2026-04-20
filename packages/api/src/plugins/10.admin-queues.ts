import { FastifyAdapter } from "@bull-board/fastify";
import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type IORedis from "ioredis";
import path from "node:path";
import { getProjectImportQueue } from "../lib/project-import-queue";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { getProjectParseQueue } from "../lib/project-parse-queue";

export default fp(async function authSessionPlugin(fastify: FastifyInstance) {
  const serverAdapter = new FastifyAdapter();
  const fastifyWithRedis = fastify as FastifyInstance & {
    redis: IORedis;
  };

  serverAdapter.setBasePath("/admin/queues");
  serverAdapter.setStaticPath(
    "/static",
    path.dirname(require.resolve("@bull-board/ui/package.json")),
  );

  const importQueue = getProjectImportQueue(fastifyWithRedis.redis);
  const parseQueue = getProjectParseQueue(fastifyWithRedis.redis);

  createBullBoard({
    queues: [new BullMQAdapter(importQueue), new BullMQAdapter(parseQueue)],
    serverAdapter,
  });

  fastify.register(serverAdapter.registerPlugin(), {
    prefix: "/admin/queues",
  });
});
