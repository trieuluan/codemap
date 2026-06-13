import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentPermissionRules } from "./permissions.ts";

test("permission rules ask for local and MCP mutating tools", () => {
  const rules = buildAgentPermissionRules(["codemap", "github"]);

  assert.equal(rules.categories.read, "allow");
  assert.equal(rules.categories.edit, "ask");
  assert.equal(rules.categories.mcp, "allow");
  assert.equal(rules.tools.write_file, "ask");
  assert.equal(rules.tools.codemap_rename_symbol, "ask");
  assert.equal(rules.tools.github_apply_patch, "ask");
});
