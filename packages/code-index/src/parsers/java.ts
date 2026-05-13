import path from "node:path";
import { Parser, Language, type Node } from "web-tree-sitter";
import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey, createExternalSymbolDraft, maskCommentsAndTemplateLiterals } from "./shared.js";
import { EMPTY_SEMANTICS, type ParsedSymbolDraft, type ParsedWorkspaceSemantics, type RepoSymbolKind } from "./types.js";

let parserReady: Promise<{ parser: Parser; language: Language }> | null = null;

function getJavaParser(): Promise<{ parser: Parser; language: Language }> {
  if (!parserReady) {
    parserReady = (async () => {
      await Parser.init();
      const wasmPath = path.resolve(
        path.dirname(require.resolve("tree-sitter-wasms/package.json")),
        "out",
        "tree-sitter-java.wasm",
      );
      const language = await Language.load(wasmPath);
      const parser = new Parser();
      parser.setLanguage(language);
      return { parser, language };
    })();
  }
  return parserReady;
}

export async function parseJavaFile(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser: Parser;
  try {
    ({ parser } = await getJavaParser());
  } catch {
    return parseJavaFileWithRegexFallback(file, projectImportId);
  }

  const tree = parser.parse(content);
  if (!tree) return parseJavaFileWithRegexFallback(file, projectImportId);

  const semantics = createEmptySemantics();
  const lines = content.split(/\r?\n/);
  const seenSymbols = new Set<string>();
  const seenImports = new Set<string>();

  walkJavaAst(tree.rootNode, (node) => {
    const line = node.startPosition.row + 1;
    const col = node.startPosition.column;
    const packageName = parseJavaPackage(node.text);
    if (packageName) {
      addJavaSymbol(semantics, seenSymbols, file, "namespace", packageName, lines[node.startPosition.row] ?? node.text, line, col, node.endPosition.row + 1, node.endPosition.column);
      return;
    }

    const importName = parseJavaImport(node.text);
    if (importName) {
      addJavaImport(semantics, seenImports, file, projectImportId, importName, line, col, node.endPosition.row + 1, node.endPosition.column);
      return;
    }

    const symbol = parseJavaSymbol(node.text, node.type, isJavaMemberNode(node));
    if (!symbol) return;
    addJavaSymbol(
      semantics,
      seenSymbols,
      file,
      symbol.kind,
      symbol.displayName,
      lines[node.startPosition.row] ?? node.text,
      line,
      col,
      node.endPosition.row + 1,
      node.endPosition.column,
      findParentJavaSymbolLocalKey(node, file.path),
    );
  });

  return semantics;
}

function createEmptySemantics(): ParsedWorkspaceSemantics {
  return {
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    calls: [],
    issues: [],
    externalSymbols: [],
  };
}

function walkJavaAst(node: Node, visitor: (node: Node) => void) {
  visitor(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walkJavaAst(child, visitor);
  }
}

function parseJavaPackage(text: string) {
  return text.trim().match(/^package\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;/)?.[1] ?? null;
}

function parseJavaImport(text: string) {
  return text.trim().match(/^import\s+(?:static\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\.\*)?)\s*;/)?.[1] ?? null;
}

function parseJavaSymbol(
  text: string,
  nodeType: string,
  isMemberNode: boolean,
): { displayName: string; kind: RepoSymbolKind } | null {
  const trimmed = text.trim();
  const typeMatch = trimmed.match(
    /^(?:(?:public|protected|private|abstract|static|final|sealed|non-sealed|strictfp)\s+)*(class|interface|enum|record|@interface)\s+([A-Za-z_]\w*)/,
  );
  if (typeMatch?.[1] && typeMatch[2]) {
    const kind = typeMatch[1] === "interface" || typeMatch[1] === "@interface"
      ? "interface"
      : typeMatch[1] === "enum"
        ? "enum"
        : "class";
    return { displayName: typeMatch[2], kind };
  }

  if (!/\b(method|constructor|declaration)\b/i.test(nodeType)) return null;
  const methodMatch = trimmed.match(
    /^(?:(?:public|protected|private|abstract|static|final|synchronized|native|strictfp)\s+)*(?:<[^>{}]+>\s*)?(?:(?:[A-Za-z_]\w*(?:<[^>{}]+>)?(?:\[\])?|\w+\.\w+)\s+)?([A-Za-z_]\w*)\s*\(/,
  );
  if (!methodMatch?.[1] || ["if", "for", "while", "switch", "catch", "try"].includes(methodMatch[1])) {
    return null;
  }
  return { displayName: methodMatch[1], kind: isMemberNode ? "method" : "function" };
}

function isJavaMemberNode(node: Node) {
  let current = node.parent;
  while (current) {
    if (/^(?:(?:public|protected|private|abstract|static|final|sealed|non-sealed|strictfp)\s+)*(class|interface|enum|record|@interface)\s+/.test(current.text.trimStart())) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function findParentJavaSymbolLocalKey(node: Node, filePath: string) {
  let current = node.parent;
  while (current) {
    const parentSymbol = parseJavaSymbol(current.text, current.type, false);
    if (parentSymbol && ["class", "interface", "enum"].includes(parentSymbol.kind)) {
      return buildLocalSymbolKey(filePath, parentSymbol.kind, parentSymbol.displayName);
    }
    current = current.parent;
  }
  return undefined;
}

function addJavaImport(
  semantics: ParsedWorkspaceSemantics,
  seenImports: Set<string>,
  file: WorkspaceFileCandidate,
  projectImportId: string,
  moduleSpecifier: string,
  line: number,
  col: number,
  endLine: number,
  endCol: number,
) {
  const localKey = buildImportLocalKey(file.path, "import", moduleSpecifier, line, col);
  if (seenImports.has(localKey)) return;
  seenImports.add(localKey);

  semantics.imports.push({
    localKey,
    moduleSpecifier,
    importKind: "import",
    isTypeOnly: false,
    importedNames: [moduleSpecifier.split(".").pop() ?? moduleSpecifier],
    line,
    col,
    endLine,
    endCol,
    resolutionKind: "package",
    targetPathText: null,
    targetExternalSymbolKey: `java:${moduleSpecifier}`,
  });
  semantics.externalSymbols.push(createExternalSymbolDraft(projectImportId, file.language!, moduleSpecifier));
}

function addJavaSymbol(
  semantics: ParsedWorkspaceSemantics,
  seenSymbols: Set<string>,
  file: WorkspaceFileCandidate,
  kind: RepoSymbolKind,
  displayName: string,
  signature: string,
  line: number,
  col: number,
  endLine: number,
  endCol: number,
  parentSymbolLocalKey?: string,
) {
  const stableKey = buildStableSymbolKey(file.path, kind, displayName, line);
  if (seenSymbols.has(stableKey)) return;
  seenSymbols.add(stableKey);

  semantics.symbols.push({
    localKey: buildLocalSymbolKey(file.path, kind, displayName),
    stableKey,
    displayName,
    kind,
    language: file.language!,
    signature: signature.trim(),
    returnType: null,
    doc: null,
    isExported: true,
    isDefaultExport: false,
    line,
    col,
    endLine,
    endCol,
    parentSymbolLocalKey,
  });
}

function parseJavaFileWithRegexFallback(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): ParsedWorkspaceSemantics {
  const semantics = createEmptySemantics();
  const lines = maskCommentsAndTemplateLiterals(file.content ?? "").split(/\r?\n/);
  const originalLines = (file.content ?? "").split(/\r?\n/);
  const seenSymbols = new Set<string>();
  const seenImports = new Set<string>();
  const containerStack: Array<{ kind: "class" | "interface" | "enum"; displayName: string; depth: number }> = [];
  let braceDepth = 0;

  lines.forEach((line, index) => {
    const originalLine = originalLines[index] ?? line;
    const lineNumber = index + 1;
    while (containerStack.length > 0 && braceDepth < containerStack[containerStack.length - 1]!.depth) {
      containerStack.pop();
    }
    const parentContainer = containerStack[containerStack.length - 1];
    let matchedContainer: { kind: "class" | "interface" | "enum"; displayName: string } | null = null;

    const packageName = parseJavaPackage(line);
    if (packageName) {
      addJavaSymbol(semantics, seenSymbols, file, "namespace", packageName, originalLine, lineNumber, line.indexOf(packageName), lineNumber, line.length);
    }

    const importName = parseJavaImport(line);
    if (importName) {
      addJavaImport(semantics, seenImports, file, projectImportId, importName, lineNumber, line.indexOf(importName), lineNumber, line.length);
    }

    const typeMatch = line.match(/^\s*(?:(?:public|protected|private|abstract|static|final|sealed|non-sealed|strictfp)\s+)*(class|interface|enum|record|@interface)\s+([A-Za-z_]\w*)/);
    if (typeMatch?.[1] && typeMatch[2]) {
      const kind = typeMatch[1] === "interface" || typeMatch[1] === "@interface"
        ? "interface"
        : typeMatch[1] === "enum"
          ? "enum"
          : "class";
      addJavaSymbol(semantics, seenSymbols, file, kind, typeMatch[2], originalLine, lineNumber, line.indexOf(typeMatch[2]), lineNumber, line.length);
      matchedContainer = { kind, displayName: typeMatch[2] };
    }

    const methodMatch = line.match(/^\s*(?:(?:public|protected|private|abstract|static|final|synchronized|native|strictfp)\s+)*(?:<[^>{}]+>\s*)?(?:(?:[A-Za-z_]\w*(?:<[^>{}]+>)?(?:\[\])?|\w+\.\w+)\s+)?([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?(?:\{|$)/);
    if (methodMatch?.[1] && !["if", "for", "while", "switch", "catch", "try"].includes(methodMatch[1])) {
      const kind = parentContainer ? "method" : "function";
      const parentSymbolLocalKey = parentContainer
        ? buildLocalSymbolKey(file.path, parentContainer.kind, parentContainer.displayName)
        : undefined;
      addJavaSymbol(semantics, seenSymbols, file, kind, methodMatch[1], originalLine, lineNumber, line.indexOf(methodMatch[1]), lineNumber, line.length, parentSymbolLocalKey);
    }

    const openBraces = (line.match(/{/g) ?? []).length;
    const closeBraces = (line.match(/}/g) ?? []).length;
    if (matchedContainer && openBraces > 0) {
      containerStack.push({ ...matchedContainer, depth: braceDepth + 1 });
    }
    braceDepth += openBraces - closeBraces;
  });

  return semantics;
}
