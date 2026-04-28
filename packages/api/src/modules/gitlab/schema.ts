import { z } from "zod";

export const gitlabCallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

export const gitlabConnectQuerySchema = z.object({
  returnTo: z.string().trim().min(1).max(500).optional(),
});

export const gitlabRepositoriesQuerySchema = z.object({
  q: z.string().trim().min(0).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type GitlabCallbackQuery = z.infer<typeof gitlabCallbackQuerySchema>;
export type GitlabConnectQuery = z.infer<typeof gitlabConnectQuerySchema>;
export type GitlabRepositoriesQuery = z.infer<typeof gitlabRepositoriesQuerySchema>;
