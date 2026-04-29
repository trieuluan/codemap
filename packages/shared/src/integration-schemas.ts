import { z } from "zod";

export const oauthCallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

export const integrationConnectQuerySchema = z.object({
  returnTo: z.string().trim().min(1).max(500).optional(),
});

export const integrationRepositoriesQuerySchema = z.object({
  q: z.string().trim().min(0).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type OAuthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
export type IntegrationConnectQuery = z.infer<
  typeof integrationConnectQuerySchema
>;
export type IntegrationRepositoriesQuery = z.infer<
  typeof integrationRepositoriesQuerySchema
>;
