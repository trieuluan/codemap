import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types.js";
import {
  addParsedCall,
  addParsedImport,
  addParsedSymbol,
  loadWasmLanguage,
  walkTree,
} from "./wasm-loader.js";

export async function parseCSharpFile(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser;
  try {
    ({ parser } = await loadWasmLanguage("tree-sitter-c_sharp.wasm"));
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
  const lang = file.language ?? "C#";

  walkTree(tree.rootNode, (node) => {
    if (
      node.type === "class_declaration" ||
      node.type === "interface_declaration" ||
      node.type === "struct_declaration" ||
      node.type === "enum_declaration" ||
      node.type === "record_declaration" ||
      node.type === "namespace_declaration"
    ) {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;
      const kind =
        node.type === "interface_declaration" ? "interface"
        : node.type === "enum_declaration" ? "enum"
        : node.type === "namespace_declaration" ? "namespace"
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

    if (node.type === "method_declaration" || node.type === "constructor_declaration") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;
      addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind: node.type === "constructor_declaration" ? "constructor" : "method",
        displayName: nameNode.text,
        node,
        lines,
      });
      return;
    }

    if (node.type === "using_directive") {
      const nameNode = node.namedChildren.find((c) => c.type === "qualified_name" || c.type === "identifier");
      if (!nameNode) return;
      addParsedImport({
        semantics,
        seenImports,
        filePath: file.path,
        projectImportId,
        moduleSpecifier: nameNode.text,
        importKind: "use",
        node,
        resolutionKind: "package",
        packageManager: "nuget",
      });
      return;
    }

    if (node.type === "invocation_expression") {
      const fnNode = node.childForFieldName("function");
      if (!fnNode) return;
      if (fnNode.type === "identifier") {
        addParsedCall(semantics, seenCalls, fnNode.text, fnNode);
      } else if (fnNode.type === "member_access_expression") {
        const name = fnNode.childForFieldName("name");
        const expr = fnNode.childForFieldName("expression");
        if (name) addParsedCall(semantics, seenCalls, name.text, name, expr?.text);
      }
    }
  });

  return semantics;
}
