import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultPermissionRules } from "./lifecycle.ts";

test("createDefaultPermissionRules returns schema-compatible object state", () => {
  assert.deepEqual(createDefaultPermissionRules(), {
    categories: {},
    tools: {},
  });
});
