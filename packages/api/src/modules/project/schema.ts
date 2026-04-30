import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  createProjectFromGithubInputSchema,
  createProjectFromGitlabInputSchema,
  createProjectInputSchema,
  triggerProjectImportInputSchema,
  updateProjectInputSchema,
  type CreateProjectFromGithubInput,
  type CreateProjectFromGitlabInput,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ProjectEditLocationsQuery,
  type ProjectFileContentQuery,
  type ProjectMapInsightsQuery,
  type ProjectImportCompareQuery,
  type ProjectListInclude,
  type ProjectMapSearchQuery,
  type ProjectSymbolUsagesQuery,
  type TriggerProjectImportInput,
  type UpdateProjectInput,
} from "@codemap/shared";
import { project, projectImport, projectMapSnapshot } from "../../db/schema";

export const projectSelectSchema = createSelectSchema(project);
export const projectInsertSchema = createInsertSchema(project);
export const projectImportSelectSchema = createSelectSchema(projectImport);
export const projectImportInsertSchema = createInsertSchema(projectImport);
export const projectMapSnapshotSelectSchema =
  createSelectSchema(projectMapSnapshot);

export const projectVisibilitySchema = projectSelectSchema.shape.visibility;
export const projectStatusSchema = projectSelectSchema.shape.status;
export const projectProviderSchema = projectSelectSchema.shape.provider;
export const projectImportStatusSchema = projectImportSelectSchema.shape.status;

export const projectParamsSchema = z.object({
  projectId: z.uuid(),
});

export const projectSymbolParamsSchema = projectParamsSchema.extend({
  symbolId: z.uuid(),
});

export const projectFileReparseBodySchema = z.object({
  path: z.string().trim().min(1).max(2000),
  content: z.string().max(4 * 1024 * 1024),
  contentHash: z.string().trim().min(1).max(64),
});

export const projectMapDiffQuerySchema = z.object({
  from: z.string().trim().min(1).max(255),
  to: z.string().trim().min(1).max(255).optional(),
  includePatch: z.preprocess(
    (val) => val === "true" || val === "1",
    z.boolean().optional(),
  ),
});

export const createProjectBodySchema = createProjectInputSchema;
export const updateProjectBodySchema = updateProjectInputSchema;
export const createProjectFromGithubBodySchema =
  createProjectFromGithubInputSchema;
export const createProjectFromGitlabBodySchema =
  createProjectFromGitlabInputSchema;
export const createProjectImportBodySchema = triggerProjectImportInputSchema;

export {
  listProjectImportsQuerySchema,
  listProjectsQuerySchema,
  projectEditLocationsQuerySchema,
  projectFileContentQuerySchema,
  projectMapInsightsQuerySchema,
  projectImportCompareQuerySchema,
  projectListIncludeSchema,
  projectMapSearchQuerySchema,
  projectSymbolUsagesQuerySchema,
} from "@codemap/shared";

export type CreateProjectBody = CreateProjectInput;
export type UpdateProjectBody = UpdateProjectInput;
export type ProjectParams = z.infer<typeof projectParamsSchema>;
export type ProjectSymbolParams = z.infer<typeof projectSymbolParamsSchema>;
export type CreateProjectImportBody = TriggerProjectImportInput;
export type ProjectMapDiffQuery = z.infer<typeof projectMapDiffQuerySchema>;
export type CreateProjectFromGithubBody = CreateProjectFromGithubInput;
export type CreateProjectFromGitlabBody = CreateProjectFromGitlabInput;
export type {
  ListProjectsQuery,
  ProjectEditLocationsQuery,
  ProjectFileContentQuery,
  ProjectMapInsightsQuery,
  ProjectImportCompareQuery,
  ProjectListInclude,
  ProjectMapSearchQuery,
  ProjectSymbolUsagesQuery,
};
