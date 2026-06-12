import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChangedFileSummary, ChangedSummary } from "../state/store.js";

const execFileAsync = promisify(execFile);

export interface GitDiffSnapshot {
  files: Map<string, ChangedFileSummary>;
}

async function git(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return "";
  }
}

function ensureEntry(
  files: Map<string, ChangedFileSummary>,
  path: string,
): ChangedFileSummary {
  const existing = files.get(path);
  if (existing) return existing;
  const created: ChangedFileSummary = {
    path,
    kind: "edited",
    additions: 0,
    deletions: 0,
  };
  files.set(path, created);
  return created;
}

function parseNameStatus(output: string): Map<string, ChangedFileSummary> {
  const files = new Map<string, ChangedFileSummary>();
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const status = parts[0] ?? "";
    if (status.startsWith("R")) {
      const previousPath = parts[1];
      const path = parts[2];
      if (!previousPath || !path) continue;
      files.set(path, {
        path,
        previousPath,
        kind: "renamed",
        additions: 0,
        deletions: 0,
      });
      continue;
    }
    const path = parts[1];
    if (!path) continue;
    const kind: ChangedFileSummary["kind"] = status === "A"
      ? "new"
      : status === "D"
        ? "deleted"
        : "edited";
    files.set(path, {
      path,
      kind,
      additions: 0,
      deletions: 0,
    });
  }
  return files;
}

function applyNumstat(files: Map<string, ChangedFileSummary>, output: string): void {
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const additionsRaw = parts[0];
    const deletionsRaw = parts[1];
    const path = parts[2];
    if (!path) continue;
    const entry = ensureEntry(files, path);
    entry.additions = additionsRaw === "-" ? 0 : Number.parseInt(additionsRaw, 10) || 0;
    entry.deletions = deletionsRaw === "-" ? 0 : Number.parseInt(deletionsRaw, 10) || 0;
  }
}

function applyUntracked(files: Map<string, ChangedFileSummary>, output: string): void {
  for (const rawLine of output.split("\n")) {
    const path = rawLine.trim();
    if (!path) continue;
    const entry = files.get(path);
    if (entry) {
      entry.kind = "new";
      continue;
    }
    files.set(path, {
      path,
      kind: "new",
      additions: 0,
      deletions: 0,
    });
  }
}

export async function captureGitDiffSnapshot(): Promise<GitDiffSnapshot> {
  const [nameStatus, numstat, untracked] = await Promise.all([
    git(["diff", "--name-status", "--find-renames", "HEAD", "--"]),
    git(["diff", "--numstat", "--find-renames", "HEAD", "--"]),
    git(["ls-files", "--others", "--exclude-standard"]),
  ]);

  const files = parseNameStatus(nameStatus);
  applyNumstat(files, numstat);
  applyUntracked(files, untracked);

  return { files };
}

function sameFile(a: ChangedFileSummary, b: ChangedFileSummary): boolean {
  return (
    a.kind === b.kind &&
    a.previousPath === b.previousPath &&
    a.additions === b.additions &&
    a.deletions === b.deletions
  );
}

export function diffGitSnapshots(
  before: GitDiffSnapshot | null,
  after: GitDiffSnapshot,
): ChangedSummary | null {
  const files: ChangedFileSummary[] = [];
  for (const [path, current] of after.files.entries()) {
    const prior = before?.files.get(path);
    if (!prior || !sameFile(prior, current)) {
      files.push({ ...current });
    }
  }

  if (files.length === 0) return null;

  files.sort((a, b) => a.path.localeCompare(b.path));

  let newCount = 0;
  let editedCount = 0;
  let deletedCount = 0;
  let renamedCount = 0;
  for (const file of files) {
    if (file.kind === "new") newCount += 1;
    else if (file.kind === "deleted") deletedCount += 1;
    else if (file.kind === "renamed") renamedCount += 1;
    else editedCount += 1;
  }

  return { files, newCount, editedCount, deletedCount, renamedCount };
}
