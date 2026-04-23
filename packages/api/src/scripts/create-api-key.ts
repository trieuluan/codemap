import { eq } from "drizzle-orm";
import { z } from "zod";
import { loadEnv } from "../config/load-env";

loadEnv();

import { db } from "../db";
import { user } from "../db/schema";
import { auth } from "../lib/auth";

const createApiKeyEnvSchema = z.object({
  API_KEY_USER_EMAIL: z.email().trim().toLowerCase(),
  API_KEY_NAME: z.string().trim().min(1).default("CodeMap API key"),
  API_KEY_PREFIX: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default("codemap_"),
  API_KEY_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().optional(),
});

async function main() {
  const env = createApiKeyEnvSchema.parse(process.env);

  const owner = await db.query.user.findFirst({
    where: eq(user.email, env.API_KEY_USER_EMAIL),
  });

  if (!owner) {
    throw new Error(`No user found for ${env.API_KEY_USER_EMAIL}`);
  }

  const apiKey = await auth.api.createApiKey({
    body: {
      name: env.API_KEY_NAME,
      prefix: env.API_KEY_PREFIX,
      userId: owner.id,
      expiresIn: env.API_KEY_EXPIRES_IN_SECONDS ?? null,
      metadata: {
        createdBy: "script:create-api-key",
      },
    },
  });

  console.log("API key created. Store this value securely; it is shown once.");
  console.log(apiKey.key);
}

void main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to create API key", error);
    process.exit(1);
  });
