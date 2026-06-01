export function isStrongModel(model: string): boolean {
  return /\b(strong|opus|sonnet|gpt-5|gpt-4|o3|o4|deepseek-r1|qwen3-coder)\b/i.test(
    model,
  );
}

export function extractCloudCommitFromGetProject(
  result: unknown,
): string | undefined {
  const structured = (result as { structuredContent?: unknown })
    ?.structuredContent;
  if (!structured || typeof structured !== "object") return undefined;

  const data = structured as {
    data?: {
      projectContext?: { latestImport?: { commitSha?: unknown } | null };
      health?: { latestImport?: { commitSha?: unknown } | null };
    };
    projectContext?: { latestImport?: { commitSha?: unknown } | null };
    health?: { latestImport?: { commitSha?: unknown } | null };
  };

  const commitSha =
    data.data?.projectContext?.latestImport?.commitSha ??
    data.data?.health?.latestImport?.commitSha ??
    data.projectContext?.latestImport?.commitSha ??
    data.health?.latestImport?.commitSha;

  return typeof commitSha === "string" && commitSha.trim()
    ? commitSha.trim()
    : undefined;
}
