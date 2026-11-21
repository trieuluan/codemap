import path from "node:path";
import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey, createExternalSymbolDraft } from "./shared.js";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types.js";
import { loadWasmLanguage, walkTree, addParsedCall, type TreeSitterLanguage as Language, type TreeSitterParser as Parser } from "./wasm-loader.js";

function getPythonParser() {
  return loadWasmLanguage("tree-sitter-python.wasm");
}

export async function parsePythonFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser: Parser;
  let language: Language;
  try {
    ({ parser, language } = await getPythonParser());
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
    calls: [],
    issues: [],
    externalSymbols: [],
  };

  // Extract class and function/method definitions
  const symbolQuery = language.query(`
    (class_definition name: (identifier) @name) @class
    (function_definition name: (identifier) @name) @function
  `);

  for (const match of symbolQuery.matches(tree.rootNode)) {
    const defCapture = match.captures.find((c) => c.name === "class" || c.name === "function");
    const nameCapture = match.captures.find((c) => c.name === "name");
    if (!defCapture || !nameCapture) continue;

    const isClass = defCapture.name === "class";
    const displayName = nameCapture.node.text;
    const startPos = defCapture.node.startPosition;
    const endPos = defCapture.node.endPosition;
    const line = startPos.row + 1;
    const col = startPos.column;

    const parentType = defCapture.node.parent?.type;
    const grandparentType = defCapture.node.parent?.parent?.type;
    const isMethod = !isClass && parentType === "block" && grandparentType === "class_definition";
    const kind = isClass ? "class" : isMethod ? "method" : "function";

    const localKey = buildLocalSymbolKey(file.path, kind, displayName);
    const isTopLevelPublic = !isMethod && !displayName.startsWith("_");

    semantics.symbols.push({
      localKey,
      stableKey: buildStableSymbolKey(file.path, kind, displayName, line),
      displayName,
      kind,
      language: file.language!,
      signature: content.split("\n")[startPos.row]?.trim() ?? null,
      returnType: null,
      doc: null,
      isExported: isTopLevelPublic,
      isDefaultExport: false,
      line,
      col,
      endLine: endPos.row + 1,
      endCol: endPos.column,
    });

    if (isTopLevelPublic) {
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

    if (isClass) {
      const superclasses = defCapture.node.childForFieldName("superclasses");
      if (superclasses) {
        for (let i = 0; i < superclasses.namedChildCount; i++) {
          const base = superclasses.namedChild(i);
          if (base && (base.type === "identifier" || base.type === "attribute")) {
            semantics.relationships.push({
              fromSymbolLocalKey: localKey,
              toSymbolName: base.text,
              relationshipKind: "extends",
            });
          }
        }
      }
    }
  }

  // Extract imports: `import X` and `from X import Y`
  const importQuery = language.query(`
    (import_statement) @stmt
    (import_from_statement) @stmt
  `);

  const seenImportKeys = new Set<string>();

  for (const match of importQuery.matches(tree.rootNode)) {
    const stmtCapture = match.captures.find((c) => c.name === "stmt");
    if (!stmtCapture) continue;

    const stmtNode = stmtCapture.node;
    const startPos = stmtNode.startPosition;
    const endPos = stmtNode.endPosition;
    const line = startPos.row + 1;
    const col = startPos.column;

    if (stmtNode.type === "import_statement") {
      for (let i = 0; i < stmtNode.childCount; i++) {
        const child = stmtNode.child(i);
        if (!child || (child.type !== "dotted_name" && child.type !== "aliased_import")) continue;
        const moduleNode = child.type === "aliased_import" ? child.child(0) : child;
        if (!moduleNode) continue;

        const moduleSpecifier = moduleNode.text;
        const localKey = buildImportLocalKey(file.path, "import", moduleSpecifier, line, col);
        if (seenImportKeys.has(localKey)) continue;
        seenImportKeys.add(localKey);

        semantics.imports.push({
          localKey,
          moduleSpecifier,
          importKind: "import",
          isTypeOnly: false,
          importedNames: [],
          line,
          col,
          endLine: endPos.row + 1,
          endCol: endPos.column,
          resolutionKind: "package",
          targetPathText: null,
          targetExternalSymbolKey: `python:${moduleSpecifier}`,
        });
        semantics.externalSymbols.push(
          createExternalSymbolDraft(projectImportId, file.language!, moduleSpecifier),
        );
      }
    } else if (stmtNode.type === "import_from_statement") {
      const moduleNameNode = stmtNode.childForFieldName("module_name");
      if (!moduleNameNode) continue;

      const rawSpecifier = moduleNameNode.text;
      const leadingDots = rawSpecifier.match(/^(\.+)/)?.[1] ?? "";
      const isRelative = leadingDots.length > 0;

      const importedNames: string[] = [];
      for (let i = 0; i < stmtNode.childCount; i++) {
        const child = stmtNode.child(i);
        if (!child) continue;
        if (child.type === "import_from_names" || child.type === "wildcard_import") {
          for (let j = 0; j < child.childCount; j++) {
            const nameNode = child.child(j);
            if (nameNode?.type === "identifier") importedNames.push(nameNode.text);
          }
        }
      }

      let targetPathText: string | null = null;
      let resolutionKind: "relative_path" | "package" | "unresolved" = "package";

      if (isRelative) {
        const levels = leadingDots.length;
        const cleanSpecifier = rawSpecifier.replace(/^\.+/, "");
        let baseDir = path.posix.dirname(file.path);
        for (let i = 1; i < levels; i++) baseDir = path.posix.dirname(baseDir);
        const candidate = cleanSpecifier
          ? `${baseDir}/${cleanSpecifier.replace(/\./g, "/")}`.replace(/\/+/g, "/")
          : baseDir;

        const candidates = [`${candidate}.py`, `${candidate}/__init__.py`];
        const resolved = candidates.find((c) => filePathSet.has(c));
        targetPathText = resolved ?? `${candidate}.py`;
        resolutionKind = resolved ? "relative_path" : "unresolved";
      }

      const localKey = buildImportLocalKey(file.path, "import", rawSpecifier, line, col);
      if (seenImportKeys.has(localKey)) continue;
      seenImportKeys.add(localKey);

      semantics.imports.push({
        localKey,
        moduleSpecifier: rawSpecifier,
        importKind: "import",
        isTypeOnly: false,
        importedNames,
        line,
        col,
        endLine: endPos.row + 1,
        endCol: endPos.column,
        resolutionKind,
        targetPathText,
        targetExternalSymbolKey: isRelative ? null : `python:${rawSpecifier}`,
      });

      if (!isRelative) {
        semantics.externalSymbols.push(
          createExternalSymbolDraft(projectImportId, file.language!, rawSpecifier),
        );
      } else if (resolutionKind === "unresolved") {
        semantics.issues.push({
          projectImportId,
          severity: "warning",
          code: "UNRESOLVED_IMPORT",
          message: `Unable to resolve import "${rawSpecifier}" from ${file.path}`,
          detailJson: { filePath: file.path, moduleSpecifier: rawSpecifier },
        });
      }
    }
  }

  // Extract calls
  const seenCalls = new Set<string>();
  walkTree(tree.rootNode, (node) => {
    if (node.type !== "call") return;
    const fnNode = node.childForFieldName("function");
    if (!fnNode) return;
    if (fnNode.type === "identifier") {
      addParsedCall(semantics, seenCalls, fnNode.text, fnNode);
    } else if (fnNode.type === "attribute") {
      const attr = fnNode.childForFieldName("attribute");
      const obj = fnNode.childForFieldName("object");
      if (attr) addParsedCall(semantics, seenCalls, attr.text, attr, obj?.text);
    }
  });

  return semantics;
}
