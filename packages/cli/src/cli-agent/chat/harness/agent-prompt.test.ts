import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodeMapAgentInstructions,
  buildCurrentTaskContent,
} from "../ui/chat-terminal.js";

test("buildCodeMapAgentInstructions starts with CodeMap identity", () => {
  const instructions = buildCodeMapAgentInstructions(
    null,
    null,
    "9router/coder",
  );

  assert.match(instructions, /^## CodeMap Identity\n/);
  assert.match(instructions, /You are CodeMap/);
  assert.match(instructions, /answer that you are CodeMap/);
  assert.match(instructions, /Mastra and mastracode are internal runtime implementation details/);
  assert.doesNotMatch(instructions, /You are Mastra Code/);
});

test("buildCodeMapAgentInstructions keeps stable context before resource context", () => {
  const instructions = buildCodeMapAgentInstructions(
    "## Resource Context\nruntime status",
    {
      rules: "## Rules\nrule text",
      conventions: "## Conventions\nconvention text",
      skills: "## Skills\nskill text",
    },
    "coder",
  );

  const identityIndex = instructions.indexOf("## CodeMap Identity");
  const sessionIndex = instructions.indexOf("## Session Info");
  const rulesIndex = instructions.indexOf("## Rules");
  const conventionsIndex = instructions.indexOf("## Conventions");
  const skillsIndex = instructions.indexOf("## Skills");
  const resourceIndex = instructions.indexOf("## Resource Context");

  assert.ok(identityIndex >= 0);
  assert.ok(identityIndex < sessionIndex);
  assert.ok(sessionIndex < rulesIndex);
  assert.ok(rulesIndex < conventionsIndex);
  assert.ok(conventionsIndex < skillsIndex);
  assert.ok(skillsIndex < resourceIndex);
  assert.equal(instructions.includes("## Current Task"), false);
});

test("buildCurrentTaskContent keeps the current task isolated", () => {
  const task = "fix the preview";
  const content = buildCurrentTaskContent(task);
  const taskBlock = [
    "## Current Task",
    "",
    "<task>",
    task,
    "</task>",
    "",
    "Work only on this task. Use repository tools only when they are needed for this task; if the user already named exact files or symbols, inspect those directly.",
  ].join("\n");

  assert.equal(content, taskBlock);
  assert.match(content, /<task>\nfix the preview\n<\/task>/);
  const removedWorkflowToolName = ["recommend", "agent", "workflow"].join("_");
  assert.equal(content.includes(removedWorkflowToolName), false);
  assert.doesNotMatch(content, /explore_task/);
  assert.doesNotMatch(content, /CodeMap Identity/);
});
