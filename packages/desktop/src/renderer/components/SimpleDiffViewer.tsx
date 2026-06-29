interface DiffFile {
  filePath: string;
  patch?: string;
  oldContent?: string;
  newContent?: string;
}

interface SimpleDiffViewerProps {
  files: DiffFile[];
  className?: string;
  selectedPath?: string | null;
  height?: number;
  onFileVisible?: (path: string) => void;
}

export function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", md: "markdown", css: "css", html: "html", py: "python",
    sh: "bash", yaml: "yaml", yml: "yaml",
  };
  return map[ext] ?? "plaintext";
}

export type { DiffFile as MonacoDiffFile };

function renderPatch(patch: string) {
  return patch.split("\n").map((line, i) => {
    let color = "inherit";
    if (line.startsWith("+") && !line.startsWith("+++")) color = "#3fb950";
    else if (line.startsWith("-") && !line.startsWith("---")) color = "#f85149";
    else if (line.startsWith("@@")) color = "#79c0ff";
    return (
      <div key={i} style={{ color, minHeight: "1.4em" }}>
        {line || " "}
      </div>
    );
  });
}

export function SimpleDiffViewer({ files, className, selectedPath, height, onFileVisible }: SimpleDiffViewerProps) {
  const filtered = selectedPath ? files.filter(f => f.filePath === selectedPath) : files;

  return (
    <div className={className} style={{ height: height ? `${height}px` : "100%", overflow: "auto" }}>
      {filtered.map((file) => {
        onFileVisible?.(file.filePath);
        const patch = file.patch ?? (
          file.oldContent !== undefined && file.newContent !== undefined
            ? generateSimpleDiff(file.filePath, file.oldContent, file.newContent)
            : ""
        );
        return (
          <div key={file.filePath} style={{ marginBottom: 16 }}>
            <div style={{ padding: "4px 8px", fontSize: 12, opacity: 0.6, borderBottom: "1px solid #30363d" }}>
              {file.filePath}
            </div>
            <pre style={{ margin: 0, padding: "8px 12px", fontSize: 12, lineHeight: 1.5, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {patch ? renderPatch(patch) : <span style={{ opacity: 0.4 }}>No changes</span>}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

function generateSimpleDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const lines: string[] = [`--- ${filePath}`, `+++ ${filePath}`];
  // ponytail: naive line diff, no LCS — upgrade to diff library if context lines needed
  const maxLen = Math.max(oldLines.length, newLines.length);
  let hasChanges = false;
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) { lines.push(` ${o ?? ""}`); continue; }
    hasChanges = true;
    if (o !== undefined) lines.push(`-${o}`);
    if (n !== undefined) lines.push(`+${n}`);
  }
  return hasChanges ? lines.join("\n") : "";
}
