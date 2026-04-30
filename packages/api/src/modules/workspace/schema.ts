import {
  createWorkspaceInputSchema,
  updateWorkspaceInputSchema,
  workspaceParamsSchema,
  workspacePlanSchema,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type WorkspaceParams,
} from "@codemap/shared";

export const createWorkspaceBodySchema = createWorkspaceInputSchema;
export const updateWorkspaceBodySchema = updateWorkspaceInputSchema;
export { workspaceParamsSchema };

import { z } from "zod";
export const setPlanBodySchema = z.object({ plan: workspacePlanSchema });

export type CreateWorkspaceBody = CreateWorkspaceInput;
export type UpdateWorkspaceBody = UpdateWorkspaceInput;
export type { WorkspaceParams };
