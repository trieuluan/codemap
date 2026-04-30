import { z } from "zod";

export const repoSymbolKindValues = [
  "module",
  "namespace",
  "class",
  "interface",
  "trait",
  "mixin",
  "enum",
  "enum_member",
  "function",
  "component",
  "method",
  "constructor",
  "property",
  "field",
  "variable",
  "constant",
  "type_alias",
  "parameter",
] as const;

const nullableTrimmedString = z.string().trim().min(1).max(500).nullable();
const nullableShortString = z.string().trim().min(1).max(255).nullable();
const nullableRepositoryUrl = z.string().trim().url().max(500).nullable();

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

export const projectListIncludeSchema = z.enum(["latestImport"]);
export const projectVisibilitySchema = z.enum([
  "private",
  "public",
  "internal",
]);
export const projectProviderSchema = z.enum([
  "github",
  "gitlab",
  "local_workspace",
]);

export const listProjectsQuerySchema = z.object({
  include: z.preprocess(
    parseIncludeQueryValue,
    z.array(projectListIncludeSchema).default([]),
  ),
});

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  description: nullableTrimmedString.optional(),
  visibility: projectVisibilitySchema.optional(),
  provider: projectProviderSchema.nullable().optional(),
  defaultBranch: nullableShortString.optional(),
  repositoryUrl: nullableRepositoryUrl.optional(),
  localWorkspacePath: z.string().trim().min(1).max(4000).nullable().optional(),
  externalRepoId: nullableShortString.optional(),
});

export const updateProjectInputSchema = createProjectInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const createProjectFromGithubInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: nullableTrimmedString.optional(),
  repositoryUrl: z.string().trim().url().max(500),
  externalRepoId: nullableShortString.optional(),
  defaultBranch: nullableShortString.optional(),
  branch: z.string().trim().min(1).max(255).optional(),
});

export const createProjectFromGitlabInputSchema =
  createProjectFromGithubInputSchema.extend({
    accessToken: z.string().trim().min(1).max(500).optional(),
  });

export const triggerProjectImportInputSchema = z.object({
  branch: z.string().trim().min(1).max(255).optional(),
});

export const projectFileContentQuerySchema = z.object({
  path: z.string().trim().min(1).max(2000),
  startLine: z.coerce.number().int().min(1).optional(),
  endLine: z.coerce.number().int().min(1).optional(),
});

export const projectMapSearchQuerySchema = z.object({
  q: z.string().trim().min(0).max(200),
  symbolKinds: z.preprocess(
    (val) => (typeof val === "string" ? val.split(",").filter(Boolean) : val),
    z.array(z.enum(repoSymbolKindValues)).optional(),
  ),
});

export const projectImportCompareQuerySchema = z.object({
  base: z.uuid(),
  head: z.uuid(),
});

export const listProjectImportsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().datetime().optional(),
});

export const projectEditLocationsQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const projectSymbolUsagesQuerySchema = z.object({
  symbolName: z.string().trim().min(1).max(255),
  path: z.string().trim().min(1).max(2000).optional(),
});

export const createProjectFromUploadQuerySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  branch: z.string().trim().min(1).max(255).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type CreateProjectFromGithubInput = z.infer<
  typeof createProjectFromGithubInputSchema
>;
export type CreateProjectFromGitlabInput = z.infer<
  typeof createProjectFromGitlabInputSchema
>;
export type TriggerProjectImportInput = z.infer<
  typeof triggerProjectImportInputSchema
>;
export type ProjectListInclude = z.infer<typeof projectListIncludeSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type ProjectFileContentQuery = z.infer<
  typeof projectFileContentQuerySchema
>;
export type ProjectMapSearchQuery = z.infer<typeof projectMapSearchQuerySchema>;
export type ProjectImportCompareQuery = z.infer<
  typeof projectImportCompareQuerySchema
>;
export type ProjectEditLocationsQuery = z.infer<
  typeof projectEditLocationsQuerySchema
>;
export type ProjectSymbolUsagesQuery = z.infer<
  typeof projectSymbolUsagesQuerySchema
>;
export type CreateProjectFromUploadQuery = z.infer<
  typeof createProjectFromUploadQuerySchema
>;
export type ListProjectImportsQuery = z.infer<typeof listProjectImportsQuerySchema>;
