import * as assert from "node:assert";
import { test } from "node:test";
import { createProjectMapPersistence } from "../../../src/modules/project-import/map-persistence";
import type { ProjectTreeNode } from "../../../src/modules/project-import/tree-builder";

test("project map persistence saves and reads snapshots through the database adapter", async () => {
  const tree: ProjectTreeNode = {
    name: "repo",
    path: "",
    type: "directory",
    children: [
      {
        name: "src",
        path: "src",
        type: "directory",
        children: [],
      },
    ],
  };

  const savedSnapshot = {
    id: "snapshot-1",
    projectId: "project-1",
    importId: "import-1",
    treeJson: tree,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let latestSnapshotLookupCount = 0;

  const database = {
    insert() {
      return {
        values() {
          return {
            returning: async () => [savedSnapshot],
          };
        },
      };
    },
    query: {
      projectMapSnapshot: {
        findFirst: async (_input: { where: unknown }) => {
          latestSnapshotLookupCount += 1;
          return savedSnapshot;
        },
      },
    },
  } as unknown as typeof import("../../../src/db").db;

  const persistence = createProjectMapPersistence(database);
  const insertedSnapshot = await persistence.saveSnapshot({
    projectId: "project-1",
    importId: "import-1",
    tree,
  });
  const latestSnapshot = await persistence.getLatestSnapshot("project-1");

  assert.deepStrictEqual(insertedSnapshot, savedSnapshot);
  assert.deepStrictEqual(latestSnapshot, savedSnapshot);
  assert.equal(latestSnapshotLookupCount, 1);
});
