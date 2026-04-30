import {
  createWorkspaceInputSchema,
  updateWorkspaceInputSchema,
  workspaceParamsSchema,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type WorkspaceParams,
} from "@codemap/shared";

export const createWorkspaceBodySchema = createWorkspaceInputSchema;
export const updateWorkspaceBodySchema = updateWorkspaceInputSchema;
export { workspaceParamsSchema };

export type CreateWorkspaceBody = CreateWorkspaceInput;
export type UpdateWorkspaceBody = UpdateWorkspaceInput;
export type { WorkspaceParams };
