import path from "node:path";
import { Parser, Language, type Node } from "web-tree-sitter";
import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey, createExternalSymbolDraft, maskCommentsAndTemplateLiterals } from "./shared.js";
import { EMPTY_SEMANTICS, type ParsedSymbolDraft, type ParsedWorkspaceSemantics, type RepoSymbolKind } from "./types.js";

let parserReady: Promise<{ parser: Parser; language: Language }> | null = null;

function getKotlinParser(): Promise<{ parser: Parser; language: Language }> {
  if (!parserReady) {
    parserReady = (async () => {
      await Parser.init();
      const wasmPath = path.resolve(
        path.dirname(require.resolve("tree-sitter-wasms/package.json")),
        "out",
        "tree-sitter-kotlin.wasm",
      );
      const language = await Language.load(wasmPath);
      const parser = new Parser();
      parser.setLanguage(language);
      return { parser, language };
    })();
  }
  return parserReady;
}

export async function parseKotlinFile(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser: Parser;
  try {
    ({ parser } = await getKotlinParser());
  } catch {
    return parseKotlinFileWithRegexFallback(file, projectImportId);
  }

  const tree = parser.parse(content);
  if (!tree) return parseKotlinFileWithRegexFallback(file, projectImportId);

  const semantics = createEmptySemantics();
  const lines = content.split(/\r?\n/);
  const seenSymbols = new Set<string>();
  const seenImports = new Set<string>();

  walkKotlinAst(tree.rootNode, (node) => {
    const line = node.startPosition.row + 1;
    const col = node.startPosition.column;
    const packageName = parseKotlinPackage(node.text);
    if (packageName) {
      addKotlinSymbol(semantics, seenSymbols, file, "namespace", packageName, lines[node.startPosition.row] ?? node.text, line, col, node.endPosition.row + 1, node.endPosition.column);
      return;
    }

    const importName = parseKotlinImport(node.text);
    if (importName) {
      addKotlinImport(semantics, seenImports, file, projectImportId, importName, line, col, node.endPosition.row + 1, node.endPosition.column);
      return;
    }

    const symbol = parseKotlinSymbol(node.text, isKotlinMemberNode(node));
    if (!symbol) return;
    addKotlinSymbol(
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
      findParentKotlinSymbolLocalKey(node, file.path),
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

function walkKotlinAst(node: Node, visitor: (node: Node) => void) {
  visitor(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walkKotlinAst(child, visitor);
  }
}

function parseKotlinPackage(text: string) {
  return text.trim().match(/^package\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/)?.[1] ?? null;
}

function parseKotlinImport(text: string) {
  return text.trim().match(/^import\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\.\*)?)(?:\s+as\s+[A-Za-z_]\w*)?/)?.[1] ?? null;
}

function parseKotlinSymbol(
  text: string,
  isMemberNode: boolean,
): { displayName: string; kind: RepoSymbolKind } | null {
  const trimmed = text.trim();
  const typeMatch = trimmed.match(
    /^(?:(?:public|protected|private|internal|open|abstract|sealed|data|value|inner|companion)\s+)*(class|interface|object|enum\s+class)\s+([A-Za-z_]\w*)/,
  );
  if (typeMatch?.[1] && typeMatch[2]) {
    const kind = typeMatch[1] === "interface"
      ? "interface"
      : typeMatch[1] === "enum class"
        ? "enum"
        : "class";
    return { displayName: typeMatch[2], kind };
  }

  const funMatch = trimmed.match(/^(?:(?:public|protected|private|internal|open|override|suspend|inline|tailrec|operator|infix|external)\s+)*fun\s+(?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)\s*(?:<[^>{}]+>)?\(/);
  if (funMatch?.[1]) {
    return { displayName: funMatch[1], kind: isMemberNode ? "method" : "function" };
  }

  const propertyMatch = trimmed.match(/^(?:(?:public|protected|private|internal|open|override|lateinit|const)\s+)*(val|var)\s+([A-Za-z_]\w*)\b/);
  if (propertyMatch?.[2]) {
    return { displayName: propertyMatch[2], kind: isMemberNode ? "property" : "variable" };
  }

  return null;
}

function isKotlinMemberNode(node: Node) {
  let current = node.parent;
  while (current) {
    if (/^(?:(?:public|protected|private|internal|open|abstract|sealed|data|value|inner|companion)\s+)*(class|interface|object|enum\s+class)\s+/.test(current.text.trimStart())) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function findParentKotlinSymbolLocalKey(node: Node, filePath: string) {
  let current = node.parent;
  while (current) {
    const parentSymbol = parseKotlinSymbol(current.text, false);
    if (parentSymbol && ["class", "interface", "enum"].includes(parentSymbol.kind)) {
      return buildLocalSymbolKey(filePath, parentSymbol.kind, parentSymbol.displayName);
    }
    current = current.parent;
  }
  return undefined;
}

function addKotlinImport(
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
    targetExternalSymbolKey: `kotlin:${moduleSpecifier}`,
  });
  semantics.externalSymbols.push(createExternalSymbolDraft(projectImportId, file.language!, moduleSpecifier));
}

function addKotlinSymbol(
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

function parseKotlinFileWithRegexFallback(
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

    const packageName = parseKotlinPackage(line);
    if (packageName) {
      addKotlinSymbol(semantics, seenSymbols, file, "namespace", packageName, originalLine, lineNumber, line.indexOf(packageName), lineNumber, line.length);
    }

    const importName = parseKotlinImport(line);
    if (importName) {
      addKotlinImport(semantics, seenImports, file, projectImportId, importName, lineNumber, line.indexOf(importName), lineNumber, line.length);
    }

    const typeSymbol = parseKotlinSymbol(line, false);
    if (typeSymbol && ["class", "interface", "enum"].includes(typeSymbol.kind)) {
      addKotlinSymbol(semantics, seenSymbols, file, typeSymbol.kind, typeSymbol.displayName, originalLine, lineNumber, line.indexOf(typeSymbol.displayName), lineNumber, line.length);
      matchedContainer = {
        kind: typeSymbol.kind as "class" | "interface" | "enum",
        displayName: typeSymbol.displayName,
      };
    }

    const funSymbol = parseKotlinSymbol(line, Boolean(parentContainer));
    if (funSymbol && (funSymbol.kind === "function" || funSymbol.kind === "method" || funSymbol.kind === "property" || funSymbol.kind === "variable")) {
      const parentSymbolLocalKey = parentContainer
        ? buildLocalSymbolKey(file.path, parentContainer.kind, parentContainer.displayName)
        : undefined;
      addKotlinSymbol(semantics, seenSymbols, file, funSymbol.kind, funSymbol.displayName, originalLine, lineNumber, line.indexOf(funSymbol.displayName), lineNumber, line.length, parentSymbolLocalKey);
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
