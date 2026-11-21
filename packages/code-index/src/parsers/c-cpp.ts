import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { resolveRelativeTargetPath } from "./shared.js";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types.js";
import {
  addParsedCall,
  addParsedImport,
  addParsedSymbol,
  loadWasmLanguage,
  walkTree,
  type SyntaxNode,
} from "./wasm-loader.js";

function extractDeclaratorName(node: SyntaxNode | null): string | null {
  if (!node) return null;
  if (node.type === "identifier" || node.type === "field_identifier" || node.type === "type_identifier") {
    return node.text;
  }
  if (node.type === "qualified_identifier") {
    const name = node.childForFieldName("name");
    return name?.text ?? node.text;
  }
  const inner = node.childForFieldName("declarator");
  return inner ? extractDeclaratorName(inner) : null;
}

export async function parseCCppFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  const isCpp = file.language === "C++";
  const wasmFile = isCpp ? "tree-sitter-cpp.wasm" : "tree-sitter-c.wasm";

  let parser;
  try {
    ({ parser } = await loadWasmLanguage(wasmFile));
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

  const lines = content.split(/\r?\n/);
  const seenSymbols = new Set<string>();
  const seenImports = new Set<string>();
  const seenCalls = new Set<string>();
  const lang = file.language ?? (isCpp ? "C++" : "C");

  walkTree(tree.rootNode, (node) => {
    if (
      node.type === "struct_specifier" ||
      node.type === "class_specifier" ||
      node.type === "enum_specifier" ||
      node.type === "namespace_definition"
    ) {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;
      const body = node.childForFieldName("body");
      if (!body && node.type !== "namespace_definition") return;
      const kind =
        node.type === "enum_specifier" ? "enum"
        : node.type === "namespace_definition" ? "namespace"
        : "class";
      const localKey = addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind,
        displayName: nameNode.text,
        node,
        lines,
      });
      if (localKey && (node.type === "class_specifier" || node.type === "struct_specifier")) {
        const baseClause = node.namedChildren.find((c) => c.type === "base_class_clause");
        if (baseClause) {
          for (const child of baseClause.namedChildren) {
            if (child.type === "type_identifier") {
              semantics.relationships.push({
                fromSymbolLocalKey: localKey,
                toSymbolName: child.text,
                relationshipKind: "extends",
              });
            }
          }
        }
      }
      return;
    }

    if (node.type === "function_definition") {
      const declarator = node.childForFieldName("declarator");
      const name = extractDeclaratorName(declarator);
      if (!name) return;
      const inClass =
        node.parent?.type === "field_declaration_list" &&
        (node.parent.parent?.type === "class_specifier" || node.parent.parent?.type === "struct_specifier");
      addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind: inClass ? "method" : "function",
        displayName: name,
        node,
        lines,
      });
      return;
    }

    if (node.type === "preproc_include") {
      const pathNode = node.childForFieldName("path");
      if (!pathNode) return;
      const raw = pathNode.text;
      const isLocal = raw.startsWith('"') && raw.endsWith('"');
      const spec = raw.slice(1, -1);
      const resolved = isLocal
        ? resolveRelativeTargetPath(file.path, spec, lang, filePathSet).resolvedPath
        : null;
      addParsedImport({
        semantics,
        seenImports,
        filePath: file.path,
        projectImportId,
        moduleSpecifier: spec,
        importKind: "include",
        node,
        resolutionKind: resolved ? "relative_path" : isLocal ? "unresolved" : "package",
        targetPathText: resolved,
      });
      return;
    }

    if (node.type === "call_expression") {
      const fnNode = node.childForFieldName("function");
      if (!fnNode) return;
      if (fnNode.type === "identifier") {
        addParsedCall(semantics, seenCalls, fnNode.text, fnNode);
      } else if (fnNode.type === "field_expression") {
        const field = fnNode.childForFieldName("field");
        if (field) addParsedCall(semantics, seenCalls, field.text, field);
      }
    }
  });

  return semantics;
}
