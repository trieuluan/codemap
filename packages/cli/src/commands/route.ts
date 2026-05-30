import type { GatewayCommandContext } from "../cli-agent/command-context.js";
import type { GatewayConfig, TaskType } from "../cli-agent/types.js";

export function runRouteCommand(ctx: GatewayCommandContext): void {
  runRoute(ctx.config, ctx.positional);
}

export function runRoute(config: GatewayConfig, task: string): void {
  if (!task) throw new Error('Missing task. Example: codemap route "fix a failing migration"');

  const taskType = inferTaskType(task);
  const risk = inferRiskLevel(task);

  console.log(`Task type: ${taskType}`);
  console.log(`Risk: ${risk}`);
  console.log(`Model: ${config.defaultModel}`);
}

function inferTaskType(task: string): TaskType {
  const lower = task.toLowerCase();
  if (/^(fix|bug|repair|patch|crash|error)/.test(lower)) return "bugfix";
  if (/^(debug|investigate|diagnose|why|trace)/.test(lower)) return "debugging";
  if (/^(implement|add|create|build|feature|support)/.test(lower)) return "feature";
  if (/^(refactor|reorganize|clean|simplify|extract)/.test(lower)) return "refactor";
  if (/^(review|check|audit|analyze|examine)/.test(lower)) return "review";
  if (/^(test|spec|coverage)/.test(lower)) return "test";
  if (/^(research|explore|understand|explain|how|find)/.test(lower)) return "research";
  return "general";
}

function inferRiskLevel(task: string): "low" | "medium" | "high" {
  const lower = task.toLowerCase();
  if (/security|auth|payment|migrate|database|schema/.test(lower)) return "high";
  if (/fix|bug|implement|add|feature/.test(lower)) return "medium";
  return "low";
}
