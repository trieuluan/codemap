import simpleGit from "simple-git";

export type GitDiffFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied";

export interface GitDiffFile {
  path: string;
  status: GitDiffFileStatus;
  oldPath?: string;
  patch?: string;
}

export interface ProjectGitDiffResult {
  from: string;
  to: string;
  files: GitDiffFile[];
}

function parseStatusChar(char: string): GitDiffFileStatus {
  switch (char) {
    case "A": return "added";
    case "D": return "deleted";
    case "R": return "renamed";
    case "C": return "copied";
    default:  return "modified";
  }
}

export async function getProjectGitDiff(input: {
  workspacePath: string;
  from: string;
  to?: string;
  includePatch?: boolean;
}): Promise<ProjectGitDiffResult> {
  const { workspacePath, from, includePatch = false } = input;
  const to = input.to ?? "HEAD";

  const git = simpleGit(workspacePath).env("GIT_TERMINAL_PROMPT", "0");

  // Resolve SHAs so the response always returns full commit hashes
  const [resolvedFrom, resolvedTo] = await Promise.all([
    git.revparse([from]).then((s) => s.trim()),
    git.revparse([to]).then((s) => s.trim()),
  ]);

  // --name-status gives us path + status char; -M detects renames
  const nameStatusOutput = await git.diff([
    "--name-status",
    "-M",
    resolvedFrom,
    resolvedTo,
  ]);

  const files: GitDiffFile[] = [];

  for (const line of nameStatusOutput.trim().split("\n")) {
    if (!line.trim()) continue;

    const parts = line.split("\t");
    const statusChar = parts[0]?.[0] ?? "M";
    const status = parseStatusChar(statusChar);

    if (status === "renamed" || status === "copied") {
      files.push({ path: parts[2] ?? "", oldPath: parts[1] ?? "", status });
    } else {
      files.push({ path: parts[1] ?? "", status });
    }
  }

  if (includePatch && files.length > 0) {
    const patchOutput = await git.diff(["-M", resolvedFrom, resolvedTo]);
    const patches = parsePatchByFile(patchOutput);

    for (const file of files) {
      file.patch = patches.get(file.path) ?? patches.get(file.oldPath ?? "") ?? undefined;
    }
  }

  return { from: resolvedFrom, to: resolvedTo, files };
}

function parsePatchByFile(patchOutput: string): Map<string, string> {
  const result = new Map<string, string>();
  // Split on "diff --git" boundaries
  const chunks = patchOutput.split(/^(?=diff --git )/m);

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    // Extract b-side path: "diff --git a/foo b/foo" → "foo"
    const match = chunk.match(/^diff --git a\/.+ b\/(.+)/);
    if (match?.[1]) {
      result.set(match[1], chunk);
    }
  }

  return result;
}
