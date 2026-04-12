import "fastify";
import type { Env } from "../config/env";
import type { db } from "../db";
import type IORedis from "ioredis";
import { SuccessMeta } from "../plugins/08.response";

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
    db: typeof db;
    redis: IORedis;
  }
  interface FastifyRequest {
    session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  }
  interface FastifyReply {
    success<T>(data: T, statusCode?: number, meta?: SuccessMeta): FastifyReply;
  }
}
