import { desc, eq } from "drizzle-orm";
import { projectMapSnapshot } from "../../../db/schema";
import type { ProjectTreeNode } from "./tree-builder";

export function createProjectMapPersistence(
  database: typeof import("../../../db").db,
) {
  return {
    async saveSnapshot(input: {
      projectId: string;
      importId: string;
      tree: ProjectTreeNode;
    }) {
      const [snapshot] = await database
        .insert(projectMapSnapshot)
        .values({
          projectId: input.projectId,
          importId: input.importId,
          treeJson: input.tree,
        })
        .returning();

      return snapshot;
    },

    async getLatestSnapshot(projectId: string) {
      return database.query.projectMapSnapshot.findFirst({
        where: eq(projectMapSnapshot.projectId, projectId),
        orderBy: [desc(projectMapSnapshot.createdAt)],
      });
    },
  };
}
