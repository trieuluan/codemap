import assert from "node:assert/strict";
import test from "node:test";
import { graphRole } from "./graph-role.js";

test("classifies the responsibility of graph files without substring collisions", () => {
  const cases = [
    ["src/main.tsx", "entry"], ["src/routers/auth.ts", "router"],
    ["packages/web/src/client/api.ts", "api"], ["src/components/Button.tsx", "ui"],
    ["src/hooks/useSession.ts", "state"], ["src/store/session.ts", "state"],
    ["src/index.ts", "index"], ["src/parser/router-utils.test.ts", "other"],
    ["src/useSession.ts", "state"], ["src/surprise.ts", "other"], ["src/computer.ts", "other"],
    ["C:\\repo\\src\\routes\\users.ts", "router"],
  ];
  for (const [path, role] of cases) assert.equal(graphRole(path).id, role, path);
});

test("specific file responsibility takes precedence over its containing UI directory", () => {
  assert.equal(graphRole("src/renderer/hooks/useGraph.ts").id, "state");
  assert.equal(graphRole("src/components/index.ts").id, "index");
  assert.equal(graphRole("src/pages/api/users.ts").id, "api");
  assert.match(graphRole("src/lib/utils.ts").color, /^#[a-f0-9]{6}$/i);
});
