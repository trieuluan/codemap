import { z } from "zod";

export const workspaceTypeSchema = z.enum(["personal", "team"]);
export const workspacePlanSchema = z.enum(["beta", "developer", "team"]);
export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);

export const workspaceParamsSchema = z.object({
  workspaceId: z.uuid(),
});

export const createWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  type: workspaceTypeSchema.default("team"),
});

export const updateWorkspaceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;
export type WorkspaceParams = z.infer<typeof workspaceParamsSchema>;
