import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey, createExternalSymbolDraft } from "./shared.js";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types.js";
import { loadWasmLanguage, walkTree, addParsedCall, type TreeSitterLanguage as Language, type TreeSitterParser as Parser } from "./wasm-loader.js";

function getPhpParser() {
  return loadWasmLanguage("tree-sitter-php.wasm");
}

export async function parsePhpFile(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser: Parser;
  let language: Language;
  try {
    ({ parser, language } = await getPhpParser());
  } catch {
    return parsePhpFileWithRegexFallback(file, projectImportId);
  }

  const tree = parser.parse(content);
  if (!tree) return parsePhpFileWithRegexFallback(file, projectImportId);

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

  // Extract symbols: namespace, class, interface, trait, enum, function, method
  const symbolQuery = language.query(`
    (namespace_definition name: (namespace_name) @name) @namespace
    (class_declaration name: (name) @name) @class
    (interface_declaration name: (name) @name) @interface
    (trait_declaration name: (name) @name) @trait
    (enum_declaration name: (name) @name) @enum
    (function_definition name: (name) @name) @function
    (method_declaration name: (name) @name) @method
  `);

  for (const match of symbolQuery.matches(tree.rootNode)) {
    const defCapture = match.captures.find((c) =>
      ["namespace", "class", "interface", "trait", "enum", "function", "method"].includes(c.name),
    );
    const nameCapture = match.captures.find((c) => c.name === "name");
    if (!defCapture || !nameCapture) continue;

    const captureName = defCapture.name as "namespace" | "class" | "interface" | "trait" | "enum" | "function" | "method";
    const kind = captureName === "namespace" ? "namespace" : captureName;
    const displayName = nameCapture.node.text;
    const startPos = defCapture.node.startPosition;
    const endPos = defCapture.node.endPosition;
    const line = startPos.row + 1;
    const col = startPos.column;

    const localKey = buildLocalSymbolKey(file.path, kind, displayName);
    semantics.symbols.push({
      localKey,
      stableKey: buildStableSymbolKey(file.path, kind, displayName, line),
      displayName,
      kind,
      language: file.language!,
      signature: lines[startPos.row]?.trim() ?? null,
      returnType: null,
      doc: null,
      isExported: true,
      isDefaultExport: false,
      line,
      col,
      endLine: endPos.row + 1,
      endCol: endPos.column,
    });
    if (kind !== "method") {
      semantics.exports.push({
        exportName: displayName,
        exportKind: "named",
        line,
        col,
        endLine: endPos.row + 1,
        endCol: endPos.column,
        symbolLocalKey: localKey,
      });
    }
    if (kind === "class" || kind === "interface") {
      for (const child of defCapture.node.namedChildren) {
        if (child.type === "base_clause" || child.type === "class_interface_clause") {
          const relKind = child.type === "base_clause" ? "extends" : "implements";
          for (const target of child.namedChildren) {
            if (target.type === "name" || target.type === "qualified_name") {
              semantics.relationships.push({
                fromSymbolLocalKey: localKey,
                toSymbolName: target.text,
                relationshipKind: relKind,
              });
            }
          }
        }
      }
    }
  }

  // Extract use statements and require/include
  const importQuery = language.query(`
    (namespace_use_declaration (namespace_use_clause (qualified_name) @name)) @use
    (require_expression (string) @path) @require
    (require_once_expression (string) @path) @require_once
    (include_expression (string) @path) @include
    (include_once_expression (string) @path) @include_once
  `);

  const seenImportKeys = new Set<string>();

  for (const match of importQuery.matches(tree.rootNode)) {
    const stmtCapture = match.captures.find((c) =>
      ["use", "require", "require_once", "include", "include_once"].includes(c.name),
    );
    const valueCapture = match.captures.find((c) => c.name === "name" || c.name === "path");
    if (!stmtCapture || !valueCapture) continue;

    const stmtNode = stmtCapture.node;
    const startPos = stmtNode.startPosition;
    const endPos = stmtNode.endPosition;
    const line = startPos.row + 1;
    const col = startPos.column;
    const isUse = stmtCapture.name === "use";
    const specifier = valueCapture.node.text.replace(/^['"]|['"]$/g, "");

    const localKey = buildImportLocalKey(file.path, isUse ? "use" : "import", specifier, line, col);
    if (seenImportKeys.has(localKey)) continue;
    seenImportKeys.add(localKey);

    semantics.imports.push({
      localKey,
      moduleSpecifier: specifier,
      importKind: isUse ? "use" : "include",
      isTypeOnly: false,
      importedNames: [],
      line,
      col,
      endLine: endPos.row + 1,
      endCol: endPos.column,
      resolutionKind: isUse ? "package" : "unresolved",
      targetPathText: isUse ? null : specifier,
      targetExternalSymbolKey: isUse ? `php:${specifier}` : null,
    });

    if (isUse) {
      semantics.externalSymbols.push(
        createExternalSymbolDraft(projectImportId, file.language!, specifier),
      );
    }
  }

  const seenCalls = new Set<string>();
  walkTree(tree.rootNode, (node) => {
    if (node.type === "function_call_expression") {
      const fn = node.childForFieldName("function");
      if (fn) addParsedCall(semantics, seenCalls, fn.text, fn);
    } else if (node.type === "member_call_expression" || node.type === "scoped_call_expression") {
      const name = node.childForFieldName("name");
      const scope = node.childForFieldName("object") ?? node.childForFieldName("scope");
      if (name) addParsedCall(semantics, seenCalls, name.text, name, scope?.text);
    }
  });

  return semantics;
}

function parsePhpFileWithRegexFallback(
  file: WorkspaceFileCandidate,
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
  const lines = (file.content ?? "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const namespaceMatch = line.match(/^\s*namespace\s+([^;{]+)\s*[;{]/);
    if (namespaceMatch?.[1]) {
      const displayName = namespaceMatch[1].trim();
      const col = line.indexOf(displayName);
      semantics.symbols.push({
        localKey: buildLocalSymbolKey(file.path, "namespace", displayName),
        stableKey: buildStableSymbolKey(file.path, "namespace", displayName, lineNumber),
        displayName,
        kind: "namespace",
        language: file.language!,
        signature: line.trim(),
        returnType: null,
        doc: null,
        isExported: true,
        isDefaultExport: false,
        line: lineNumber,
        col: Math.max(col, 0),
        endLine: lineNumber,
        endCol: Math.max(col, 0) + displayName.length,
      });
      return;
    }

    const useMatch = line.match(/^\s*use\s+([^;]+)\s*;/);
    if (useMatch?.[1]) {
      const moduleSpecifier = useMatch[1].trim();
      const col = line.indexOf(moduleSpecifier);
      semantics.imports.push({
        localKey: buildImportLocalKey(file.path, "use", moduleSpecifier, lineNumber, Math.max(col, 0)),
        moduleSpecifier,
        importKind: "use",
        isTypeOnly: false,
        importedNames: [moduleSpecifier.split("\\").pop() ?? moduleSpecifier],
        line: lineNumber,
        col: Math.max(col, 0),
        endLine: lineNumber,
        endCol: Math.max(col, 0) + moduleSpecifier.length,
        resolutionKind: "package",
        targetPathText: null,
        targetExternalSymbolKey: `php:${moduleSpecifier}`,
      });
      semantics.externalSymbols.push(
        createExternalSymbolDraft(projectImportId, file.language!, moduleSpecifier),
      );
      return;
    }

    const symbolMatch = line.match(
      /^\s*(class|interface|trait|enum|function)\s+([A-Za-z_][A-Za-z0-9_]*)/,
    );
    if (!symbolMatch?.[1] || !symbolMatch[2]) return;

    const kind = symbolMatch[1] as "class" | "interface" | "trait" | "enum" | "function";
    const displayName = symbolMatch[2];
    const col = line.indexOf(displayName);
    semantics.symbols.push({
      localKey: buildLocalSymbolKey(file.path, kind, displayName),
      stableKey: buildStableSymbolKey(file.path, kind, displayName, lineNumber),
      displayName,
      kind,
      language: file.language!,
      signature: line.trim(),
      returnType: null,
      doc: null,
      isExported: true,
      isDefaultExport: false,
      line: lineNumber,
      col: Math.max(col, 0),
      endLine: lineNumber,
      endCol: Math.max(col, 0) + displayName.length,
    });
  });

  return semantics;
}
