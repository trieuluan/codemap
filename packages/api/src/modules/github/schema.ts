import { z } from "zod";

export const githubCallbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

export type GithubCallbackQuery = z.infer<typeof githubCallbackQuerySchema>;
