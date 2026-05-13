import path from "node:path";
import { Parser, Language, type Node } from "web-tree-sitter";
import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey, createExternalSymbolDraft, maskCommentsAndTemplateLiterals, resolveRelativeTargetPath } from "./shared.js";
import { EMPTY_SEMANTICS, type ParsedImportDraft, type ParsedSymbolDraft, type ParsedWorkspaceSemantics, type RepoImportKind, type RepoImportResolutionKind, type RepoSymbolKind } from "./types.js";

let parserReady: Promise<{ parser: Parser; language: Language }> | null = null;

function getDartParser(): Promise<{ parser: Parser; language: Language }> {
  if (!parserReady) {
    parserReady = (async () => {
      await Parser.init();
      const wasmPath = path.resolve(
        path.dirname(require.resolve("tree-sitter-wasms/package.json")),
        "out",
        "tree-sitter-dart.wasm",
      );
      const language = await Language.load(wasmPath);
      const parser = new Parser();
      parser.setLanguage(language);
      return { parser, language };
    })();
  }
  return parserReady;
}

export async function parseDartFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser: Parser;
  try {
    ({ parser } = await getDartParser());
  } catch {
    return parseDartFileWithRegexFallback(file, filePathSet, projectImportId);
  }

  const tree = parser.parse(content);
  if (!tree) return parseDartFileWithRegexFallback(file, filePathSet, projectImportId);

  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    calls: [],
    issues: [],
    externalSymbols: [],
  };
  const lines = content.split(/\r?\n/);
  const seenImportKeys = new Set<string>();
  const seenSymbolKeys = new Set<string>();

  walkDartAst(tree.rootNode, (node) => {
    const directive = parseDartDirective(node.text);
    if (directive) {
      addDartImport({
        directive,
        file,
        filePathSet,
        projectImportId,
        semantics,
        seenImportKeys,
        line: node.startPosition.row + 1,
        col: node.startPosition.column,
        endLine: node.endPosition.row + 1,
        endCol: node.endPosition.column,
      });
      return;
    }

    const symbol = parseDartSymbol(node.text, node.type, isDartMemberNode(node));
    if (!symbol) return;

    const line = node.startPosition.row + 1;
    const localKey = buildLocalSymbolKey(file.path, symbol.kind, symbol.displayName);
    const stableKey = buildStableSymbolKey(file.path, symbol.kind, symbol.displayName, line);
    if (seenSymbolKeys.has(stableKey)) return;
    seenSymbolKeys.add(stableKey);

    semantics.symbols.push({
      localKey,
      stableKey,
      displayName: symbol.displayName,
      kind: symbol.kind,
      language: file.language!,
      signature: lines[node.startPosition.row]?.trim() ?? null,
      returnType: null,
      doc: null,
      isExported: true,
      isDefaultExport: false,
      line,
      col: Math.max(node.startPosition.column, 0),
      endLine: node.endPosition.row + 1,
      endCol: node.endPosition.column,
      parentSymbolLocalKey: findParentDartSymbolLocalKey(node, file.path),
    });
  });

  return semantics;
}

function walkDartAst(node: Node, visitor: (node: Node) => void) {
  visitor(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walkDartAst(child, visitor);
  }
}

function parseDartDirective(text: string) {
  const match = text.match(/^\s*(import|export|part)\s+['"]([^'"]+)['"]/);
  if (!match?.[1] || !match[2]) return null;
  return {
    kind: match[1] as "import" | "export" | "part",
    moduleSpecifier: match[2],
  };
}

function addDartImport(input: {
  directive: { kind: "import" | "export" | "part"; moduleSpecifier: string };
  file: WorkspaceFileCandidate;
  filePathSet: Set<string>;
  projectImportId: string;
  semantics: ParsedWorkspaceSemantics;
  seenImportKeys: Set<string>;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}) {
  const importKind: RepoImportKind =
    input.directive.kind === "part"
      ? "include"
      : input.directive.kind === "export"
        ? "export_from"
        : "import";
  const localKey = buildImportLocalKey(
    input.file.path,
    importKind,
    input.directive.moduleSpecifier,
    input.line,
    input.col,
  );
  if (input.seenImportKeys.has(localKey)) return;
  input.seenImportKeys.add(localKey);

  const resolution = resolveDartImport(
    input.file.path,
    input.directive.moduleSpecifier,
    input.file.language!,
    input.filePathSet,
  );

  const importDraft: ParsedImportDraft = {
    localKey,
    moduleSpecifier: input.directive.moduleSpecifier,
    importKind,
    isTypeOnly: false,
    importedNames: [],
    line: input.line,
    col: input.col,
    endLine: input.endLine,
    endCol: input.endCol,
    resolutionKind: resolution.resolutionKind,
    targetPathText: resolution.targetPathText,
    targetExternalSymbolKey: resolution.targetExternalSymbolKey,
  };
  input.semantics.imports.push(importDraft);

  if (resolution.targetExternalSymbolKey) {
    input.semantics.externalSymbols.push(
      createExternalSymbolDraft(input.projectImportId, input.file.language!, input.directive.moduleSpecifier),
    );
  }

  if (resolution.resolutionKind === "unresolved") {
    input.semantics.issues.push({
      projectImportId: input.projectImportId,
      severity: "warning",
      code: "UNRESOLVED_IMPORT",
      message: `Unable to resolve ${input.directive.kind} "${input.directive.moduleSpecifier}" from ${input.file.path}`,
      detailJson: {
        filePath: input.file.path,
        moduleSpecifier: input.directive.moduleSpecifier,
        kind: input.directive.kind,
      },
    });
  }

  if (input.directive.kind === "export") {
    input.semantics.exports.push({
      exportName: input.directive.moduleSpecifier,
      exportKind: "re_export",
      line: input.line,
      col: input.col,
      endLine: input.endLine,
      endCol: input.endCol,
      sourceImportLocalKey: localKey,
      targetExternalSymbolKey: resolution.targetExternalSymbolKey,
    });
  }
}

function resolveDartImport(
  filePath: string,
  moduleSpecifier: string,
  language: string,
  filePathSet: Set<string>,
): {
  resolutionKind: RepoImportResolutionKind;
  targetPathText: string | null;
  targetExternalSymbolKey: string | null;
} {
  if (moduleSpecifier.startsWith("dart:")) {
    return {
      resolutionKind: "builtin",
      targetPathText: null,
      targetExternalSymbolKey: `dart:${moduleSpecifier}`,
    };
  }

  if (moduleSpecifier.startsWith("package:")) {
    const packagePath = moduleSpecifier.replace(/^package:[^/]+\//, "");
    const internalTarget = packagePath ? `lib/${packagePath}` : null;
    if (internalTarget && filePathSet.has(internalTarget)) {
      return {
        resolutionKind: "relative_path",
        targetPathText: internalTarget,
        targetExternalSymbolKey: null,
      };
    }
    return {
      resolutionKind: "package",
      targetPathText: null,
      targetExternalSymbolKey: `dart:${moduleSpecifier}`,
    };
  }

  const resolution = resolveRelativeTargetPath(filePath, moduleSpecifier, language, filePathSet);
  return {
    resolutionKind: resolution.resolvedPath ? "relative_path" : "unresolved",
    targetPathText: resolution.resolvedPath ?? resolution.attemptedPath,
    targetExternalSymbolKey: null,
  };
}

function parseDartSymbol(
  text: string,
  nodeType: string,
  isMemberNode: boolean,
): { displayName: string; kind: RepoSymbolKind } | null {
  const trimmed = text.trim();
  const declarationMatch = trimmed.match(
    /^(?:(?:abstract|base|final|interface|sealed)\s+)*(class|mixin|enum)\s+([A-Za-z_]\w*)/,
  );
  if (declarationMatch?.[1] && declarationMatch[2]) {
    return {
      kind: declarationMatch[1] === "mixin" ? "mixin" : declarationMatch[1] as RepoSymbolKind,
      displayName: declarationMatch[2],
    };
  }

  const extensionMatch = trimmed.match(/^extension(?:\s+type)?\s+([A-Za-z_]\w*)\b/);
  if (extensionMatch?.[1] && extensionMatch[1] !== "on") {
    return { kind: "mixin", displayName: extensionMatch[1] };
  }

  const typeAliasMatch = trimmed.match(/^typedef\s+([A-Za-z_]\w*)\b/);
  if (typeAliasMatch?.[1]) {
    return { kind: "type_alias", displayName: typeAliasMatch[1] };
  }

  if (!/\b(function|method|constructor|declaration|signature)\b/i.test(nodeType)) {
    return null;
  }

  const callableMatch = trimmed.match(
    /^(?:(?:static|external|abstract|factory|const|late|final)\s+)*(?:[A-Za-z_]\w*(?:<[^>{}]+>)?(?:[?*])?\s+)?([A-Za-z_]\w*)\s*(?:<[^>{}]+>)?\(/,
  );
  if (!callableMatch?.[1] || ["if", "for", "while", "switch", "catch", "assert"].includes(callableMatch[1])) {
    return null;
  }

  return {
    kind: isMemberNode ? "method" : "function",
    displayName: callableMatch[1],
  };
}

function isDartMemberNode(node: Node) {
  let current = node.parent;
  while (current) {
    const trimmed = current.text.trimStart();
    if (/^(?:(?:abstract|base|final|interface|sealed)\s+)*class\s+/.test(trimmed)) return true;
    if (/^(?:base\s+)?mixin\s+/.test(trimmed)) return true;
    if (/^extension(?:\s+type)?\s+/.test(trimmed)) return true;
    current = current.parent;
  }
  return false;
}

function findParentDartSymbolLocalKey(node: Node, filePath: string) {
  let current = node.parent;
  while (current) {
    const parentSymbol = parseDartSymbol(current.text, current.type, false);
    if (parentSymbol && ["class", "mixin", "enum"].includes(parentSymbol.kind)) {
      return buildLocalSymbolKey(filePath, parentSymbol.kind, parentSymbol.displayName);
    }
    current = current.parent;
  }
  return undefined;
}

function parseDartFileWithRegexFallback(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): ParsedWorkspaceSemantics {
  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    calls: [],
    issues: [],
    externalSymbols: [],
  };
  const originalLines = (file.content ?? "").split(/\r?\n/);
  const lines = maskCommentsAndTemplateLiterals(file.content ?? "").split(/\r?\n/);
  const seenImportKeys = new Set<string>();
  const containerStack: Array<{ kind: "class" | "mixin" | "enum"; displayName: string; depth: number }> = [];
  let braceDepth = 0;

  lines.forEach((line, index) => {
    const originalLine = originalLines[index] ?? line;
    const lineNumber = index + 1;
    while (containerStack.length > 0 && braceDepth < containerStack[containerStack.length - 1]!.depth) {
      containerStack.pop();
    }
    const parentContainer = containerStack[containerStack.length - 1];
    let matchedContainerSymbol: { kind: "class" | "mixin" | "enum"; displayName: string } | null = null;

    for (const match of line.matchAll(/^\s*(import|export|part)\s+['"]([^'"]+)['"]/g)) {
      const kind = match[1] as "import" | "export" | "part" | undefined;
      const moduleSpecifier = match[2];
      if (!kind || !moduleSpecifier) continue;

      addDartImport({
        directive: { kind, moduleSpecifier },
        file,
        filePathSet,
        projectImportId,
        semantics,
        seenImportKeys,
        line: lineNumber,
        col: match.index ?? 0,
        endLine: lineNumber,
        endCol: (match.index ?? 0) + match[0].length,
      });
    }

    const symbolPatterns: Array<{ regex: RegExp; kind: "class" | "mixin" | "enum" | "type_alias" }> = [
      { regex: /^\s*(?:(?:abstract|base|final|interface|sealed)\s+)*class\s+([A-Za-z_]\w*)/, kind: "class" },
      { regex: /^\s*(?:base\s+)?mixin\s+([A-Za-z_]\w*)/, kind: "mixin" },
      { regex: /^\s*extension(?:\s+type)?\s+([A-Za-z_]\w*)/, kind: "mixin" },
      { regex: /^\s*enum\s+([A-Za-z_]\w*)/, kind: "enum" },
      { regex: /^\s*typedef\s+([A-Za-z_]\w*)/, kind: "type_alias" },
    ];

    for (const pattern of symbolPatterns) {
      const match = line.match(pattern.regex);
      if (!match?.[1] || match[1] === "on") continue;

      const displayName = match[1];
      const col = line.indexOf(displayName);
      const symbol = buildDartRegexSymbol(file, pattern.kind, displayName, originalLine, lineNumber, col);
      semantics.symbols.push(symbol);
      if (pattern.kind === "class" || pattern.kind === "mixin" || pattern.kind === "enum") {
        matchedContainerSymbol = { kind: pattern.kind, displayName };
      }
      break;
    }

    const functionMatch = line.match(
      /^\s*(?:(?:static|external|factory|const)\s+)*(?:[A-Za-z_]\w*(?:<[^>{}]+>)?(?:[?*])?\s+)?([A-Za-z_]\w*)\s*(?:<[^>{}]+>)?\([^;{}]*\)\s*(?:async\s*)?(?:=>|{|$)/,
    );
    if (functionMatch?.[1] && !["if", "for", "while", "switch", "catch", "assert"].includes(functionMatch[1])) {
      const displayName = functionMatch[1];
      const kind = parentContainer ? "method" : "function";
      const col = line.indexOf(displayName);
      const symbol = buildDartRegexSymbol(file, kind, displayName, originalLine, lineNumber, col);
      if (parentContainer) {
        symbol.parentSymbolLocalKey = buildLocalSymbolKey(file.path, parentContainer.kind, parentContainer.displayName);
      }
      semantics.symbols.push(symbol);
    }

    const openBraces = (line.match(/{/g) ?? []).length;
    const closeBraces = (line.match(/}/g) ?? []).length;
    const nextBraceDepth = braceDepth + openBraces - closeBraces;
    if (matchedContainerSymbol && openBraces > 0) {
      containerStack.push({ ...matchedContainerSymbol, depth: braceDepth + 1 });
    }
    braceDepth = nextBraceDepth;
  });

  return semantics;
}

function buildDartRegexSymbol(
  file: WorkspaceFileCandidate,
  kind: RepoSymbolKind,
  displayName: string,
  line: string,
  lineNumber: number,
  col: number,
): ParsedSymbolDraft {
  return {
    localKey: buildLocalSymbolKey(file.path, kind, displayName),
    stableKey: buildStableSymbolKey(file.path, kind, displayName, lineNumber),
    displayName,
    kind,
    language: file.language!,
    signature: line.trim(),
    returnType: null,
    doc: null,
    isExported: false,
    isDefaultExport: false,
    line: lineNumber,
    col: Math.max(col, 0),
    endLine: lineNumber,
    endCol: Math.max(col, 0) + displayName.length,
  };
}
