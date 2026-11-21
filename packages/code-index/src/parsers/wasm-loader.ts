import path from "node:path";
import Parser from "web-tree-sitter";
import {
  buildImportLocalKey,
  buildLocalSymbolKey,
  buildStableSymbolKey,
  createExternalSymbolDraft,
} from "./shared.js";
import type {
  ParsedWorkspaceSemantics,
  RepoImportKind,
  RepoImportResolutionKind,
  RepoSymbolKind,
} from "./types.js";

export type SyntaxNode = Parser.SyntaxNode;
export type TreeSitterLanguage = Parser.Language;
export type TreeSitterParser = Parser;

let initPromise: Promise<void> | null = null;
const MAX_CACHED_LANGUAGES = 4;
const languageCache = new Map<string, Promise<Parser.Language>>();

function ensureParserInit(): Promise<void> {
  if (!initPromise) {
    initPromise = Parser.init();
  }
  return initPromise;
}

/**
 * Load and cache a Tree-sitter WASM grammar from `tree-sitter-wasms`.
 * Returns a fresh Parser instance bound to the cached Language so concurrent parses are safe.
 */
export async function loadWasmLanguage(
  wasmFileName: string,
): Promise<{ parser: Parser; language: Parser.Language }> {
  await ensureParserInit();

  let langPromise = languageCache.get(wasmFileName);
  if (langPromise) {
    // Refresh LRU order
    languageCache.delete(wasmFileName);
    languageCache.set(wasmFileName, langPromise);
  } else {
    if (languageCache.size >= MAX_CACHED_LANGUAGES) {
      const oldestKey = languageCache.keys().next().value;
      if (oldestKey) languageCache.delete(oldestKey);
    }
    const wasmPath = path.resolve(
      path.dirname(require.resolve("tree-sitter-wasms/package.json")),
      "out",
      wasmFileName,
    );
    langPromise = Parser.Language.load(wasmPath);
    languageCache.set(wasmFileName, langPromise);
  }

  const language = await langPromise;
  const parser = new Parser();
  parser.setLanguage(language);
  return { parser, language };
}

export interface AddSymbolOptions {
  semantics: ParsedWorkspaceSemantics;
  seenSymbols: Set<string>;
  filePath: string;
  language: string;
  kind: RepoSymbolKind;
  displayName: string;
  node: SyntaxNode;
  lines: string[];
  isExported?: boolean;
  parentSymbolLocalKey?: string;
}

export function addParsedSymbol(opts: AddSymbolOptions): string | null {
  const {
    semantics,
    seenSymbols,
    filePath,
    language,
    kind,
    displayName,
    node,
    lines,
    isExported = true,
    parentSymbolLocalKey,
  } = opts;
  const cleanName = displayName.trim();
  if (!cleanName) return null;

  const line = node.startPosition.row + 1;
  const col = node.startPosition.column;
  const localKey = buildLocalSymbolKey(filePath, kind, cleanName);
  const stableKey = buildStableSymbolKey(filePath, kind, cleanName, line);

  if (seenSymbols.has(stableKey)) return localKey;
  seenSymbols.add(stableKey);

  semantics.symbols.push({
    localKey,
    stableKey,
    displayName: cleanName,
    kind,
    language,
    signature: lines[node.startPosition.row]?.trim() ?? null,
    returnType: null,
    doc: null,
    isExported,
    isDefaultExport: false,
    line,
    col,
    endLine: node.endPosition.row + 1,
    endCol: node.endPosition.column,
    ...(parentSymbolLocalKey ? { parentSymbolLocalKey } : {}),
  });

  if (isExported) {
    semantics.exports.push({
      exportName: cleanName,
      exportKind: "named",
      line,
      col,
      endLine: node.endPosition.row + 1,
      endCol: node.endPosition.column,
      symbolLocalKey: localKey,
    });
  }

  return localKey;
}

export interface AddImportOptions {
  semantics: ParsedWorkspaceSemantics;
  seenImports: Set<string>;
  filePath: string;
  projectImportId: string;
  moduleSpecifier: string;
  importKind: RepoImportKind;
  node: SyntaxNode;
  importedNames?: string[];
  resolutionKind?: RepoImportResolutionKind;
  targetPathText?: string | null;
  packageManager?: string | null;
}

export function addParsedImport(opts: AddImportOptions): void {
  const {
    semantics,
    seenImports,
    filePath,
    projectImportId,
    moduleSpecifier,
    importKind,
    node,
    importedNames = [],
    resolutionKind = "package",
    targetPathText = null,
    packageManager = null,
  } = opts;

  const spec = moduleSpecifier.trim();
  if (!spec) return;

  const line = node.startPosition.row + 1;
  const col = node.startPosition.column;
  const dedupKey = `${spec}:${line}:${col}`;
  if (seenImports.has(dedupKey)) return;
  seenImports.add(dedupKey);

  let targetExternalSymbolKey: string | null = null;
  if (resolutionKind === "package") {
    const ext = createExternalSymbolDraft(
      projectImportId,
      packageManager ?? "unknown",
      spec,
    );
    targetExternalSymbolKey = ext.symbolKey;
    semantics.externalSymbols.push(ext);
  }

  semantics.imports.push({
    localKey: buildImportLocalKey(filePath, importKind, spec, line, col),
    moduleSpecifier: spec,
    importKind,
    isTypeOnly: false,
    importedNames,
    line,
    col,
    endLine: node.endPosition.row + 1,
    endCol: node.endPosition.column,
    resolutionKind,
    targetPathText,
    targetExternalSymbolKey,
  });
}

export function addParsedCall(
  semantics: ParsedWorkspaceSemantics,
  seenCalls: Set<string>,
  calleeName: string,
  node: SyntaxNode,
  namespaceName?: string,
): void {
  const name = calleeName.trim();
  if (!name) return;
  const line = node.startPosition.row + 1;
  const col = node.startPosition.column;
  const key = `${namespaceName ?? ""}:${name}:${line}:${col}`;
  if (seenCalls.has(key)) return;
  seenCalls.add(key);

  semantics.calls.push({
    calleeName: name,
    ...(namespaceName ? { namespaceName } : {}),
    line,
    col,
    endCol: node.endPosition.column,
  });
}

/** Walk all descendant nodes in a Tree-sitter AST. */
export function walkTree(
  root: SyntaxNode,
  visitor: (node: SyntaxNode) => void,
): void {
  const stack: SyntaxNode[] = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    visitor(current);
    for (let i = current.namedChildCount - 1; i >= 0; i--) {
      const child = current.namedChild(i);
      if (child) stack.push(child);
    }
  }
}
