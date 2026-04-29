import path from "node:path";
import { Parser, Language, Query } from "web-tree-sitter";
import type { WorkspaceFileCandidate } from "../file-discovery";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey, createExternalSymbolDraft } from "./shared";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types";

let parserReady: Promise<{ parser: Parser; language: Language }> | null = null;

function getPhpParser(): Promise<{ parser: Parser; language: Language }> {
  if (!parserReady) {
    parserReady = (async () => {
      await Parser.init();
      const wasmPath = path.resolve(
        path.dirname(require.resolve("tree-sitter-wasms/package.json")),
        "out",
        "tree-sitter-php.wasm",
      );
      const language = await Language.load(wasmPath);
      const parser = new Parser();
      parser.setLanguage(language);
      return { parser, language };
    })();
  }
  return parserReady;
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
    return { ...EMPTY_SEMANTICS };
  }

  const tree = parser.parse(content);
  if (!tree) return { ...EMPTY_SEMANTICS };

  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    issues: [],
    externalSymbols: [],
  };

  const lines = content.split(/\r?\n/);

  // Extract symbols: namespace, class, interface, trait, enum, function, method
  const symbolQuery = new Query(language, `
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
    const line = startPos.row + 1;
    const col = startPos.column;

    semantics.symbols.push({
      localKey: buildLocalSymbolKey(file.path, kind, displayName),
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
      endCol: col + displayName.length,
    });
  }

  // Extract use statements and require/include
  const importQuery = new Query(language, `
    (use_declaration (use_declarator (qualified_name) @name)) @use
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
      endCol: stmtNode.endPosition.column,
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

  return semantics;
}
