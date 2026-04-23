import { betterAuth } from "better-auth";
import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";

function getApiKeyFromHeaders(headers?: Headers | null) {
  const apiKeyHeader = headers?.get("x-api-key")?.trim();

  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  const authorizationHeader = headers?.get("authorization")?.trim();

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, ...tokenParts] = authorizationHeader.split(/\s+/);

  if (scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const token = tokenParts.join(" ").trim();
  return token || null;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),

  baseURL: process.env.BETTER_AUTH_URL,
  basePath: "/auth",

  trustedOrigins: [
    ...(process.env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()) || [
      "http://localhost:3000",
    ]),
  ],

  emailAndPassword: {
    enabled: true,
  },

  plugins: [
    apiKey({
      customAPIKeyGetter: (ctx) => getApiKeyFromHeaders(ctx.headers),
      defaultPrefix: "codemap_",
      enableMetadata: true,
      enableSessionForAPIKeys: true,
      rateLimit: {
        enabled: true,
        maxRequests: 10_000,
        timeWindow: 1000 * 60 * 60 * 24,
      },
    }),
  ],

  socialProviders: {
    // github: {
    //   clientId: process.env.GITHUB_CLIENT_ID!,
    //   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    // },
    // google: {
    //   clientId: process.env.GOOGLE_CLIENT_ID!,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    // },
  },
});
