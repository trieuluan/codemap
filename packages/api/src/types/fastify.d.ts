import "fastify";
import type { Env } from "../config/env";
import type { db } from "../db";
import { SuccessMeta } from "../plugins/08.response";

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
    db: typeof db;
  }
  interface FastifyRequest {
    session: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  }
  interface FastifyReply {
    success<T>(data: T, statusCode?: number, meta?: SuccessMeta): FastifyReply;
  }
}
