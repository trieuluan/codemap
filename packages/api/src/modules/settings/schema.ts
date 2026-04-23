import { z } from "zod";

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  expiryPreset: z.enum(["never", "90_days"]).default("90_days"),
});

export const revokeApiKeyParamsSchema = z.object({
  apiKeyId: z.string().trim().min(1),
});

export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;
export type RevokeApiKeyParams = z.infer<typeof revokeApiKeyParamsSchema>;
