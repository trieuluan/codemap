import { useEffect, useRef } from "react";
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
  onFileVisible?: (filePath: string) => void;
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

/** Escape a string for use in a CSS attribute selector value. */
function cssEscape(value: string): string {
  try {
    return CSS.escape(value);
  } catch {
    // Fallback for environments without CSS.escape
    return value.replace(/["\\]/g, "\\$&");
  }
}

/** A single-file diff section with its own Monaco editor. */
function DiffSection({
  file,
  instanceId,
}: {
  file: MonacoDiffFile;
  instanceId: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const modelsRef = useRef<monaco.editor.ITextModel[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    const body = bodyRef.current;
    if (!host || !body) return;

    const language = file.language ?? languageFromPath(file.path);
    const originalModel = monaco.editor.createModel(
      file.original,
      language,
      modelUri(instanceId, "original", file.oldPath ?? file.path),
    );
    const modifiedModel = monaco.editor.createModel(
      file.modified,
      language,
      modelUri(instanceId, "modified", file.path),
    );
    modelsRef.current = [originalModel, modifiedModel];

    const editor = monaco.editor.createDiffEditor(host, {
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
      hideUnchangedRegions: {
        enabled: true,
        minimumLineCount: 3,
        contextLineCount: 3,
      },
      scrollbar: {
        vertical: "hidden",
        horizontal: "auto",
        alwaysConsumeMouseWheel: false,
      },
      overviewRulerLanes: 0,
    });
    editor.setModel({ original: originalModel, modified: modifiedModel });
    editorRef.current = editor;

    function syncHeight() {
      const mh = editor.getModifiedEditor().getContentHeight();
      const oh = editor.getOriginalEditor().getContentHeight();
      const h = Math.max(mh, oh);
      body!.style.height = `${h}px`;
      editor.layout({ width: host!.clientWidth, height: h });
    }

    const d1 = editor.onDidUpdateDiff(syncHeight);
    const d2 = editor.getModifiedEditor().onDidContentSizeChange(syncHeight);
    const d3 = editor.getOriginalEditor().onDidContentSizeChange(syncHeight);
    syncHeight();

    const ro = new ResizeObserver(() => {
      const h = hostRef.current;
      const b = bodyRef.current;
      if (!h || !b || !editorRef.current) return;
      editorRef.current.layout({ width: h.clientWidth, height: b.clientHeight });
    });
    ro.observe(host);

    return () => {
      d1.dispose();
      d2.dispose();
      d3.dispose();
      ro.disconnect();
      editorRef.current?.dispose();
      editorRef.current = null;
      for (const m of modelsRef.current) m.dispose();
      modelsRef.current = [];
    };
  }, [file.path, instanceId]);

  return (
    <div className="diff-section" data-file-path={file.path}>
      <div className="diff-section-header">
        <span className="diff-section-path">
          {file.oldPath && file.oldPath !== file.path
            ? `${file.oldPath} → ${file.path}`
            : file.path}
        </span>
      </div>
      <div className="diff-section-body" ref={bodyRef} style={{ height: "200px" }}>
        <div className="diff-section-host" ref={hostRef} />
      </div>
    </div>
  );
}

export function MonacoDiffViewer({
  files,
  selectedPath,
  onFileVisible,
  height = "100%",
  className,
}: MonacoDiffViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const instanceIdRef = useRef(`viewer-${++nextViewerId}`);
  const scrollingByClickRef = useRef(false);
  const ioTriggeredPathRef = useRef<string | null>(null);

  ensureMonacoEnvironment();

  // IntersectionObserver — highlight file in tree based on scroll position
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || !onFileVisible) return;

    const ratios = new Map<string, number>();
    let currentVisible = "";

    const observer = new IntersectionObserver(
      (entries) => {
        // Skip IO callbacks triggered by programmatic scroll-to
        if (scrollingByClickRef.current) return;

        for (const entry of entries) {
          const path = (entry.target as HTMLElement).dataset.filePath ?? "";
          ratios.set(path, entry.intersectionRatio);
        }

        let maxR = 0;
        let maxP = "";
        for (const [p, r] of ratios) {
          if (r > maxR) {
            maxR = r;
            maxP = p;
          }
        }

        if (maxP && maxP !== currentVisible && maxR >= 0.1) {
          currentVisible = maxP;
          ioTriggeredPathRef.current = maxP;
          onFileVisible(maxP);
        }
      },
      {
        root: scroll,
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
      },
    );

    const sections = scroll.querySelectorAll<HTMLElement>("[data-file-path]");
    sections.forEach((s) => observer.observe(s));

    return () => observer.disconnect();
  }, [files, onFileVisible]);

  // Scroll to file when tree click changes selectedPath (not from IO)
  useEffect(() => {
    if (!selectedPath || !scrollRef.current) return;

    // Skip if this selectedPath change came from IntersectionObserver
    if (ioTriggeredPathRef.current === selectedPath) {
      ioTriggeredPathRef.current = null;
      return;
    }
    ioTriggeredPathRef.current = null;

    const el = scrollRef.current.querySelector(
      `[data-file-path="${cssEscape(selectedPath)}"]`,
    );
    if (!el) return;

    scrollingByClickRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });

    // Re-enable IO after smooth scroll completes (~500ms)
    const timer = setTimeout(() => {
      scrollingByClickRef.current = false;
    }, 500);

    return () => clearTimeout(timer);
  }, [selectedPath]);

  if (files.length === 0) {
    return (
      <div className={viewerClassName(className)} style={{ height }}>
        <div className="monaco-diff-empty">No diff selected</div>
      </div>
    );
  }

  return (
    <div className={viewerClassName(className)} style={{ height }}>
      <div className="monaco-diff-scroll" ref={scrollRef}>
        {files.map((file) => (
          <DiffSection
            key={file.path}
            file={file}
            instanceId={instanceIdRef.current}
          />
        ))}
      </div>
    </div>
  );
}
