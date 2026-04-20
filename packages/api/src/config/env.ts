import { z } from "zod";

export const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  CORS_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.string().trim().min(1).default("redis://127.0.0.1:6379"),
  IMPORT_QUEUE_NAME: z.string().trim().min(1).default("project-imports"),
  PARSE_QUEUE_NAME: z.string().trim().min(1).default("project-parses"),
  CODEMAP_STORAGE_ROOT: z.string().trim().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(env: NodeJS.ProcessEnv): Env {
  return envSchema.parse(env);
}
