import { useEffect, useMemo, useRef } from "react";
import * as monaco from "monaco-editor";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

export interface MonacoDiffFile {
  path: string;
  oldPath?: string;
  original: string;
  modified: string;
  language?: string;
}

interface MonacoDiffViewerProps {
  files: MonacoDiffFile[];
  selectedPath?: string | null;
  height?: number | string;
  className?: string;
}

let monacoEnvironmentReady = false;
let nextViewerId = 0;

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (_moduleId: string, label: string) => Worker;
    };
  }
}

function ensureMonacoEnvironment() {
  if (monacoEnvironmentReady) return;
  window.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      if (label === "json") {
        return new JsonWorker();
      }
      if (label === "css" || label === "scss" || label === "less") {
        return new CssWorker();
      }
      if (label === "html" || label === "handlebars" || label === "razor") {
        return new HtmlWorker();
      }
      if (label === "typescript" || label === "javascript") {
        return new TsWorker();
      }
      return new EditorWorker();
    },
  };
  monacoEnvironmentReady = true;
}

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  md: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  sql: "sql",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

export function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "plaintext";
}

function modelUri(instanceId: string, kind: "original" | "modified", path: string) {
  return monaco.Uri.parse(
    `codemap-diff:///${instanceId}/${kind}/${encodeURIComponent(path)}`,
  );
}

function viewerClassName(className?: string) {
  return className ? `monaco-diff-viewer ${className}` : "monaco-diff-viewer";
}

export function MonacoDiffViewer({
  files,
  selectedPath,
  height = "100%",
  className,
}: MonacoDiffViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const modelsRef = useRef<monaco.editor.ITextModel[]>([]);
  const frameRef = useRef<number | null>(null);
  const instanceIdRef = useRef(`viewer-${++nextViewerId}`);

  const selectedFile = useMemo(() => {
    if (files.length === 0) return null;
    return files.find((file) => file.path === selectedPath) ?? files[0] ?? null;
  }, [files, selectedPath]);

  useEffect(() => {
    ensureMonacoEnvironment();
    if (!hostRef.current || editorRef.current) return;

    const editor = monaco.editor.createDiffEditor(hostRef.current, {
      automaticLayout: false,
      readOnly: true,
      renderSideBySide: true,
      originalEditable: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      lineHeight: 18,
      padding: { top: 8, bottom: 8 },
      theme: "vs-dark",
      wordWrap: "off",
      hideUnchangedRegions: { enabled: true, minimumLineCount: 3, contextLineCount: 3 },
      scrollbar: { vertical: "hidden", horizontal: "auto", alwaysConsumeMouseWheel: false },
      overviewRulerLanes: 0,
    });
    editorRef.current = editor;

    function syncHeight() {
      const host = hostRef.current;
      if (!host) return;
      editor.layout({ width: host.clientWidth, height: host.clientHeight });
    }

    const d1 = editor.getModifiedEditor().onDidContentSizeChange(syncHeight);
    const d2 = editor.getOriginalEditor().onDidContentSizeChange(syncHeight);
    const d3 = editor.onDidUpdateDiff(syncHeight);

    // Re-layout when container width changes (e.g. inspector resize)
    const ro = new ResizeObserver(() => {
      const host = hostRef.current;
      if (!host) return;
      editor.layout({ width: host.clientWidth, height: host.clientHeight });
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      d1.dispose();
      d2.dispose();
      d3.dispose();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      editorRef.current?.setModel(null);
      editorRef.current?.dispose();
      editorRef.current = null;
      for (const model of modelsRef.current) model.dispose();
      modelsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !selectedFile) return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    editor.setModel(null);
    for (const model of modelsRef.current) model.dispose();
    modelsRef.current = [];

    const language = selectedFile.language ?? languageFromPath(selectedFile.path);
    const originalModel = monaco.editor.createModel(
      selectedFile.original,
      language,
      modelUri(instanceIdRef.current, "original", selectedFile.oldPath ?? selectedFile.path),
    );
    const modifiedModel = monaco.editor.createModel(
      selectedFile.modified,
      language,
      modelUri(instanceIdRef.current, "modified", selectedFile.path),
    );
    modelsRef.current = [originalModel, modifiedModel];

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (editorRef.current !== editor) return;
      editor.setModel({ original: originalModel, modified: modifiedModel });
    });

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [selectedFile]);

  if (!selectedFile) {
    return (
      <div className={viewerClassName(className)} style={{ height }}>
        <div className="monaco-diff-empty">No diff selected</div>
      </div>
    );
  }

  return (
    <div className={viewerClassName(className)} style={{ height }}>
      <div className="monaco-diff-file-label">
        {selectedFile.oldPath && selectedFile.oldPath !== selectedFile.path
          ? `${selectedFile.oldPath} → ${selectedFile.path}`
          : selectedFile.path}
      </div>
      <div className="monaco-diff-host" ref={hostRef} />
    </div>
  );
}
