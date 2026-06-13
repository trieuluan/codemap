import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodeMapAgentInstructions,
  buildCurrentTaskContent,
} from "./prompt.ts";

test("buildCodeMapAgentInstructions keeps stable context before resources", () => {
  const instructions = buildCodeMapAgentInstructions(
    "RESOURCE",
    { rules: "RULES", conventions: "CONVENTIONS" },
    "model-x",
  );

  assert.match(instructions, /^## CodeMap Identity/);
  assert.ok(instructions.indexOf("model-x") < instructions.indexOf("RULES"));
  assert.ok(instructions.indexOf("RULES") < instructions.indexOf("RESOURCE"));
});

test("buildCurrentTaskContent isolates the current task", () => {
  const content = buildCurrentTaskContent("Fix the parser");

  assert.match(content, /<task>\nFix the parser\n<\/task>/);
});
