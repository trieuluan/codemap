import { z } from "zod";

export const createProjectFromUploadQuerySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  branch: z.string().trim().min(1).max(255).optional(),
});

export type CreateProjectFromUploadQuery = z.infer<
  typeof createProjectFromUploadQuerySchema
>;
