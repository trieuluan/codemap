/**
 * Builds a compact markdown outline for a source file.
 * Used by the MCP `get_file_outline` tool to reduce token usage compared to
 * sending the full file content.
 */

type SymbolRow = {
  id: string;
  displayName: string;
  kind: string;
  signature: string | null;
  isExported: boolean;
  parentSymbolName: string | null;
  startLine: number | null;
};

type ImportEdgeRow = {
  moduleSpecifier: string;
  importKind: string;
  isTypeOnly: boolean;
  isResolved: boolean;
  targetFilePath: string | null;
  targetPathText: string | null;
};

type ExportRow = {
  exportName: string;
  exportKind: string;
  symbolDisplayName: string | null;
  startLine: number;
};

type FileRow = {
  path: string;
  language: string | null;
  lineCount: number | null;
  parseStatus: string;
};

export function buildFileOutlineMarkdown({
  file,
  imports,
  exports,
  symbols,
}: {
  file: FileRow;
  imports: ImportEdgeRow[];
  exports: ExportRow[];
  symbols: SymbolRow[];
}): string {
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(`# ${file.path}`);
  lines.push("");

  const meta: string[] = [];
  if (file.language) meta.push(`**Language:** ${file.language}`);
  if (file.lineCount != null) meta.push(`**Lines:** ${file.lineCount}`);
  meta.push(`**Parse:** ${file.parseStatus}`);
  lines.push(meta.join(" | "));
  lines.push("");

  // ── Imports ──────────────────────────────────────────────────────────────────
  if (imports.length > 0) {
    lines.push(`## Imports (${imports.length})`);
    for (const imp of imports) {
      const target = imp.targetFilePath ?? imp.targetPathText ?? imp.moduleSpecifier;
      const typeOnly = imp.isTypeOnly ? " *(type)*" : "";
      const unresolved = imp.isResolved ? "" : " *(unresolved)*";
      lines.push(`- \`${imp.moduleSpecifier}\` → \`${target}\`${typeOnly}${unresolved}`);
    }
    lines.push("");
  }

  // ── Exports ──────────────────────────────────────────────────────────────────
  if (exports.length > 0) {
    lines.push(`## Exports (${exports.length})`);
    for (const exp of exports) {
      const name = exp.symbolDisplayName ?? exp.exportName;
      const loc = ` · line ${exp.startLine}`;
      lines.push(`- \`${name}\` (${exp.exportKind})${loc}`);
    }
    lines.push("");
  }

  // ── Symbols ──────────────────────────────────────────────────────────────────
  if (symbols.length > 0) {
    const topLevel = symbols.filter((s) => s.parentSymbolName === null);
    const childrenByParent = new Map<string, SymbolRow[]>();
    for (const s of symbols) {
      if (s.parentSymbolName) {
        const arr = childrenByParent.get(s.parentSymbolName) ?? [];
        arr.push(s);
        childrenByParent.set(s.parentSymbolName, arr);
      }
    }

    lines.push(`## Symbols (${symbols.length})`);

    for (const sym of topLevel) {
      const loc = sym.startLine != null ? ` · line ${sym.startLine}` : "";
      const exported = sym.isExported ? " · exported" : "";
      lines.push(`### ${sym.displayName} · ${sym.kind}${exported}${loc}`);

      if (sym.signature) {
        lines.push("```");
        lines.push(sym.signature);
        lines.push("```");
      }

      const children = childrenByParent.get(sym.displayName) ?? [];
      for (const child of children) {
        const childLoc = child.startLine != null ? ` · line ${child.startLine}` : "";
        const childExp = child.isExported ? " · exported" : "";
        const sigPart = child.signature ? ` — \`${child.signature}\`` : "";
        lines.push(
          `- **${child.displayName}** · ${child.kind}${childExp}${childLoc}${sigPart}`,
        );
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}
