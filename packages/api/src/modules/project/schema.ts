import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { project, projectImport, projectMapSnapshot } from "../../db/schema";

export const projectSelectSchema = createSelectSchema(project);
export const projectInsertSchema = createInsertSchema(project);
export const projectImportSelectSchema = createSelectSchema(projectImport);
export const projectImportInsertSchema = createInsertSchema(projectImport);
export const projectMapSnapshotSelectSchema = createSelectSchema(projectMapSnapshot);

export const projectVisibilitySchema = projectSelectSchema.shape.visibility;
export const projectStatusSchema = projectSelectSchema.shape.status;
export const projectProviderSchema = projectSelectSchema.shape.provider;
export const projectImportStatusSchema = projectImportSelectSchema.shape.status;
export const projectListIncludeSchema = z.enum(["latestImport"]);

const nullableTrimmedString = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .nullable();

const nullableShortString = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .nullable();

export const projectParamsSchema = z.object({
  projectId: z.uuid(),
});

export const projectFileContentQuerySchema = z.object({
  path: z.string().trim().min(1).max(2000),
});

export const projectFileSyncBodySchema = z.object({
  path: z.string().trim().min(1).max(2000),
  content: z.string().max(4 * 1024 * 1024), // 4 MB limit
  localUpdatedAt: z.iso.datetime().optional(),
});

export const projectMapSearchQuerySchema = z.object({
  q: z.string().trim().min(0).max(200),
});

export const createProjectFromGithubBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: nullableTrimmedString.optional(),
  repositoryUrl: z.string().trim().url().max(500),
  externalRepoId: nullableShortString.optional(),
  defaultBranch: nullableShortString.optional(),
  branch: z.string().trim().min(1).max(255).optional(),
});

function parseIncludeQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => `${item}`.split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export const listProjectsQuerySchema = z.object({
  include: z.preprocess(
    parseIncludeQueryValue,
    z.array(projectListIncludeSchema).default([]),
  ),
});

export const createProjectBodySchema = projectInsertSchema
  .omit({
    id: true,
    ownerUserId: true,
    status: true,
    lastImportedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(140)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    description: nullableTrimmedString.optional(),
    defaultBranch: nullableShortString.optional(),
    repositoryUrl: z.string().trim().url().max(500).nullable().optional(),
    localWorkspacePath: z.string().trim().min(1).max(4000).nullable().optional(),
    externalRepoId: nullableShortString.optional(),
  });

export const updateProjectBodySchema = createProjectBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const createProjectImportBodySchema = projectImportInsertSchema
  .pick({
    branch: true,
  })
  .extend({
    branch: z.string().trim().min(1).max(255).optional(),
  });

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;
export type ProjectParams = z.infer<typeof projectParamsSchema>;
export type CreateProjectImportBody = z.infer<typeof createProjectImportBodySchema>;
export type ProjectListInclude = z.infer<typeof projectListIncludeSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type ProjectFileContentQuery = z.infer<typeof projectFileContentQuerySchema>;
export type ProjectMapSearchQuery = z.infer<typeof projectMapSearchQuerySchema>;
export type CreateProjectFromGithubBody = z.infer<
  typeof createProjectFromGithubBodySchema
>;
