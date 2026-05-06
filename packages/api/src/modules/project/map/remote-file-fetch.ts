import type { ProjectFilePreviewResult } from "./file-preview";

interface RemoteFileFetchInput {
  provider: "github" | "gitlab";
  repositoryUrl: string;
  commitSha: string;
  filePath: string;
  accessToken: string | null;
  startLine?: number;
  endLine?: number;
}

// Extract "owner/repo" from various GitHub URL formats
function parseGitHubRepo(repositoryUrl: string): string | null {
  const patterns = [/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/];
  for (const pattern of patterns) {
    const match = repositoryUrl.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Extract GitLab project path (may be nested: group/subgroup/repo)
function parseGitLabRepo(repositoryUrl: string): string | null {
  const match = repositoryUrl.match(/gitlab\.com[/:](.+?)(?:\.git)?$/);
  if (!match) return null;
  return match[1];
}

async function fetchGitHubFileContent(
  repoPath: string,
  commitSha: string,
  filePath: string,
  accessToken: string | null,
): Promise<string | null> {
  const url = `https://api.github.com/repos/${repoPath}/contents/${filePath}?ref=${commitSha}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "codemap/1.0",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, { headers });

  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);

  const data = (await res.json()) as {
    content?: string;
    encoding?: string;
    size?: number;
  };

  // Files > 1MB: GitHub returns no content, must use Git Data API
  if (!data.content && data.size && data.size > 1_000_000) {
    return fetchGitHubBlobContent(repoPath, commitSha, filePath, accessToken);
  }

  if (!data.content || data.encoding !== "base64") return null;
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString(
    "utf-8",
  );
}

async function fetchGitHubBlobContent(
  repoPath: string,
  _commitSha: string,
  filePath: string,
  accessToken: string | null,
): Promise<string | null> {
  // Resolve blob SHA via tree API
  const [owner, repo] = repoPath.split("/");
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${_commitSha}?recursive=1`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "codemap/1.0",
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const treeRes = await fetch(treeUrl, { headers });
  if (!treeRes.ok) return null;

  const tree = (await treeRes.json()) as {
    tree: Array<{ path: string; sha: string; type: string }>;
  };
  const blob = tree.tree.find((t) => t.path === filePath && t.type === "blob");
  if (!blob) return null;

  const blobRes = await fetch(
    `https://api.github.com/repos/${repoPath}/git/blobs/${blob.sha}`,
    { headers },
  );
  if (!blobRes.ok) return null;

  const blobData = (await blobRes.json()) as {
    content?: string;
    encoding?: string;
  };
  if (!blobData.content || blobData.encoding !== "base64") return null;
  return Buffer.from(blobData.content.replace(/\n/g, ""), "base64").toString(
    "utf-8",
  );
}

async function fetchGitLabFileContent(
  repoPath: string,
  commitSha: string,
  filePath: string,
  accessToken: string | null,
): Promise<string | null> {
  const encodedPath = encodeURIComponent(repoPath);
  const encodedFile = encodeURIComponent(filePath);
  const url = `https://gitlab.com/api/v4/projects/${encodedPath}/repository/files/${encodedFile}/raw?ref=${commitSha}`;
  const headers: Record<string, string> = { "User-Agent": "codemap/1.0" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error(`GitLab API error ${res.status}: ${res.statusText}`);

  return res.text();
}

export async function fetchRemoteFileContent(
  input: RemoteFileFetchInput,
): Promise<ProjectFilePreviewResult> {
  const { provider, repositoryUrl, commitSha, filePath, accessToken } = input;

  let content: string | null = null;

  try {
    if (provider === "github") {
      const repoPath = parseGitHubRepo(repositoryUrl);
      if (!repoPath) throw new Error("Cannot parse GitHub repository URL");
      content = await fetchGitHubFileContent(
        repoPath,
        commitSha,
        filePath,
        accessToken,
      );
    } else {
      const repoPath = parseGitLabRepo(repositoryUrl);
      if (!repoPath) throw new Error("Cannot parse GitLab repository URL");
      content = await fetchGitLabFileContent(
        repoPath,
        commitSha,
        filePath,
        accessToken,
      );
    }
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Remote fetch failed";
    return buildRemoteUnavailable(filePath, reason);
  }

  if (content === null) {
    return buildRemoteUnavailable(filePath, "File not found at this commit");
  }

  const ext = filePath.split(".").pop()?.toLowerCase() ?? null;

  return {
    path: filePath,
    name: filePath.split("/").pop() ?? filePath,
    type: "file",
    extension: ext,
    language: inferLanguageFromExtension(ext),
    kind: "text",
    mimeType: null,
    status: "ready",
    content: content
      .split(/\r?\n/)
      .slice(input.startLine ? input.startLine - 1 : 0, input.endLine)
      .join("\n"),
    sizeBytes: Buffer.byteLength(content, "utf-8"),
    reason: null,
  };
}

function buildRemoteUnavailable(
  filePath: string,
  reason: string,
): ProjectFilePreviewResult {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? null;
  return {
    path: filePath,
    name: filePath.split("/").pop() ?? filePath,
    type: "file",
    extension: ext,
    language: inferLanguageFromExtension(ext),
    kind: "binary",
    mimeType: null,
    status: "unavailable",
    content: null,
    sizeBytes: null,
    reason,
  };
}

function inferLanguageFromExtension(ext: string | null): string | null {
  if (!ext) return null;
  const map: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    py: "Python",
    rb: "Ruby",
    go: "Go",
    rs: "Rust",
    java: "Java",
    kt: "Kotlin",
    cs: "C#",
    cpp: "C++",
    c: "C",
    json: "JSON",
    yml: "YAML",
    yaml: "YAML",
    toml: "TOML",
    md: "Markdown",
    css: "CSS",
    scss: "SCSS",
    html: "HTML",
  };
  return map[ext] ?? null;
}
