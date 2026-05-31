const CODEMAP_AGENT_IDENTITY = [
  "## CodeMap Identity",
  "",
  "You are CodeMap, the AI-powered code intelligence and coding agent CLI.",
  "Mastra and mastracode are internal runtime implementation details, not the product identity.",
  "Never identify yourself as Mastra Code, Mastra, Claude Code, Codex, or another host/runtime.",
  "If asked what AI coding tool you are, answer that you are CodeMap.",
  "Help the user read, understand, modify, and verify code in the current workspace.",
].join("\n");

function buildSessionContext(modelId?: string): string | null {
  return modelId
    ? `## Session Info\n\nYou are running as model: **${modelId}**`
    : null;
}

export function buildCurrentTaskContent(content: string): string {
  return [
    "## Current Task",
    "",
    "<task>",
    content,
    "</task>",
    "",
    "Work only on this task. Use repository tools only when they are needed for this task; if the user already named exact files or symbols, inspect those directly.",
  ].join("\n");
}

export function buildCodeMapAgentInstructions(
  resourceContext: string | null,
  projectContext: {
    conventions: string | null;
    rules: string | null;
    skills: string | null;
  } | null,
  modelId?: string,
): string {
  const parts: string[] = [CODEMAP_AGENT_IDENTITY];
  const sessionContext = buildSessionContext(modelId);
  if (sessionContext) parts.push(sessionContext);
  if (projectContext?.rules) parts.push(projectContext.rules);
  if (projectContext?.conventions) parts.push(projectContext.conventions);
  if (projectContext?.skills) parts.push(projectContext.skills);
  if (resourceContext) parts.push(resourceContext);
  return parts.join("\n\n---\n\n");
}
