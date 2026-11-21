import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types.js";
import {
  addParsedCall,
  addParsedImport,
  addParsedSymbol,
  loadWasmLanguage,
  walkTree,
} from "./wasm-loader.js";

export async function parseSwiftFile(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser;
  try {
    ({ parser } = await loadWasmLanguage("tree-sitter-swift.wasm"));
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
  const lang = file.language ?? "Swift";

  walkTree(tree.rootNode, (node) => {
    if (node.type === "class_declaration" || node.type === "protocol_declaration") {
      const nameNode = node.childForFieldName("name") ?? node.namedChildren.find((c) => c.type === "type_identifier");
      if (!nameNode) return;
      const text = node.text.trimStart();
      const kind =
        node.type === "protocol_declaration" ? "interface"
        : text.startsWith("enum ") ? "enum"
        : "class";
      addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind,
        displayName: nameNode.text,
        node,
        lines,
      });
      return;
    }

    if (node.type === "function_declaration") {
      const nameNode = node.childForFieldName("name") ?? node.namedChildren.find((c) => c.type === "simple_identifier");
      if (!nameNode) return;
      const inType = node.parent?.type === "class_body" || node.parent?.type === "protocol_body";
      addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind: inType ? "method" : "function",
        displayName: nameNode.text,
        node,
        lines,
      });
      return;
    }

    if (node.type === "import_declaration") {
      const modNode = node.namedChildren.find((c) => c.type === "identifier");
      if (!modNode) return;
      addParsedImport({
        semantics,
        seenImports,
        filePath: file.path,
        projectImportId,
        moduleSpecifier: modNode.text,
        importKind: "import",
        node,
        resolutionKind: "package",
        packageManager: "swiftpm",
      });
      return;
    }

    if (node.type === "call_expression") {
      const first = node.namedChild(0);
      if (!first) return;
      if (first.type === "simple_identifier") {
        addParsedCall(semantics, seenCalls, first.text, first);
      } else if (first.type === "navigation_expression") {
        const suffix = first.namedChildren[first.namedChildCount - 1];
        if (suffix) addParsedCall(semantics, seenCalls, suffix.text.replace(/^\./, ""), suffix);
      }
    }
  });

  return semantics;
}
