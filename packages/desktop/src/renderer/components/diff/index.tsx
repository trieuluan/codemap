import { type BundledLanguage, codeToHtml } from "shiki";
import { useEffect, useState } from "react";

export interface DiffLine {
  type: "add" | "del" | "ctx" | "hunk" | "header";
  raw: string;
  content: string;
}

export function parseDiffLines(diff: string): DiffLine[] {
  return diff.split("\n").map((line): DiffLine => {
    if (line.startsWith("---") || line.startsWith("+++")) {
      return { type: "header", raw: line, content: line };
    }
    if (line.startsWith("@@")) {
      return { type: "hunk", raw: line, content: line };
    }
    if (line.startsWith("+")) {
      return { type: "add", raw: line, content: line.slice(1) };
    }
    if (line.startsWith("-")) {
      return { type: "del", raw: line, content: line.slice(1) };
    }
    return { type: "ctx", raw: line, content: line.startsWith(" ") ? line.slice(1) : line };
  });
}

async function highlightDiffLines(
  lines: DiffLine[],
  lang: BundledLanguage,
): Promise<Array<[string, string]>> {
  const contentLines = lines.map((l) => l.content);
  const code = contentLines.join("\n");

  const [lightHtml, darkHtml] = await Promise.all([
    codeToHtml(code, { lang, theme: "one-light" }),
    codeToHtml(code, { lang, theme: "one-dark-pro" }),
  ]);

  const extractLines = (html: string): string[] =>
    html
      .split('<span class="line">')
      .slice(1)
      .map((seg) => {
        const end = seg.lastIndexOf("</span>");
        return end >= 0 ? seg.slice(0, end) : seg;
      });

  const lightLines = extractLines(lightHtml);
  const darkLines = extractLines(darkHtml);

  return lines.map((_, i) => [lightLines[i] ?? "", darkLines[i] ?? ""]);
}

export function DiffPreview({ diff, language }: { diff: string; language?: BundledLanguage }) {
  const parsed = parseDiffLines(diff);
  const [highlighted, setHighlighted] = useState<Array<[string, string]> | null>(null);

  useEffect(() => {
    if (!language) return;
    let cancelled = false;
    highlightDiffLines(parsed, language).then((result) => {
      if (!cancelled) setHighlighted(result);
    });
    return () => { cancelled = true; };
  }, [diff, language]);

  return (
    <div className="overflow-auto rounded-md border bg-background font-mono text-xs leading-5 py-2">
      {parsed.map((line, i) => {
        const isAdd = line.type === "add";
        const isDel = line.type === "del";
        const isHunk = line.type === "hunk";
        const isHeader = line.type === "header";
        const marker = isAdd ? "+" : isDel ? "-" : " ";

        const rowClass = isAdd
          ? "bg-green-500/15 px-3 whitespace-pre flex"
          : isDel
            ? "bg-red-500/15 px-3 whitespace-pre flex"
            : "px-3 whitespace-pre flex";

        const markerClass = isAdd
          ? "text-green-400 select-none mr-2 shrink-0"
          : isDel
            ? "text-red-400 select-none mr-2 shrink-0"
            : isHunk
              ? "text-blue-400 select-none mr-2 shrink-0"
              : "text-muted-foreground select-none mr-2 shrink-0";

        if (isHunk || isHeader) {
          return (
            <div key={i} className={rowClass}>
              <span className={isHunk ? "text-blue-400" : "text-muted-foreground"}>
                {line.raw || " "}
              </span>
            </div>
          );
        }

        const lightInner = highlighted?.[i]?.[0];
        const darkInner = highlighted?.[i]?.[1];

        return (
          <div key={i} className={rowClass}>
            <span className={markerClass}>{marker}</span>
            {lightInner !== undefined ? (
              <>
                <span
                  className="dark:hidden"
                  dangerouslySetInnerHTML={{ __html: lightInner || "&nbsp;" }}
                />
                <span
                  className="hidden dark:inline"
                  dangerouslySetInnerHTML={{ __html: darkInner || "&nbsp;" }}
                />
              </>
            ) : (
              <span>{line.content || " "}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
