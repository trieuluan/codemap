import { z } from "zod";

export const githubCallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

export const githubConnectQuerySchema = z.object({
  returnTo: z.string().trim().min(1).max(500).optional(),
});

export const githubRepositoriesQuerySchema = z.object({
  q: z.string().trim().min(0).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type GithubCallbackQuery = z.infer<typeof githubCallbackQuerySchema>;
export type GithubConnectQuery = z.infer<typeof githubConnectQuerySchema>;
export type GithubRepositoriesQuery = z.infer<
  typeof githubRepositoriesQuerySchema
>;
