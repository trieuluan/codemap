import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types.js";
import {
  addParsedCall,
  addParsedImport,
  addParsedSymbol,
  loadWasmLanguage,
  walkTree,
} from "./wasm-loader.js";

function isGoExported(name: string): boolean {
  return /^[A-Z]/.test(name);
}

export async function parseGoFile(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser;
  try {
    ({ parser } = await loadWasmLanguage("tree-sitter-go.wasm"));
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
  const lang = file.language ?? "Go";

  walkTree(tree.rootNode, (node) => {
    if (node.type === "type_spec") {
      const nameNode = node.childForFieldName("name");
      const typeNode = node.childForFieldName("type");
      if (!nameNode) return;
      const kind =
        typeNode?.type === "interface_type" ? "interface"
        : typeNode?.type === "struct_type" ? "class"
        : "type_alias";
      addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind,
        displayName: nameNode.text,
        node,
        lines,
        isExported: isGoExported(nameNode.text),
      });
      return;
    }

    if (node.type === "function_declaration" || node.type === "method_declaration") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;
      let parentKey: string | undefined;
      if (node.type === "method_declaration") {
        const recv = node.childForFieldName("receiver")?.text ?? "";
        const match = recv.match(/\*?([A-Za-z_][A-Za-z0-9_]*)\s*\)$/);
        if (match?.[1]) {
          parentKey = `${file.path}#class:${match[1]}`;
        }
      }
      addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind: node.type === "method_declaration" ? "method" : "function",
        displayName: nameNode.text,
        node,
        lines,
        isExported: isGoExported(nameNode.text),
        parentSymbolLocalKey: parentKey,
      });
      return;
    }

    if (node.type === "import_spec") {
      const pathNode = node.childForFieldName("path");
      if (!pathNode) return;
      const spec = pathNode.text.replace(/^["`]|["`]$/g, "");
      addParsedImport({
        semantics,
        seenImports,
        filePath: file.path,
        projectImportId,
        moduleSpecifier: spec,
        importKind: "import",
        node,
        resolutionKind: "package",
        packageManager: "go",
      });
      return;
    }

    if (node.type === "call_expression") {
      const fnNode = node.childForFieldName("function");
      if (!fnNode) return;
      if (fnNode.type === "identifier") {
        addParsedCall(semantics, seenCalls, fnNode.text, fnNode);
      } else if (fnNode.type === "selector_expression") {
        const field = fnNode.childForFieldName("field");
        const operand = fnNode.childForFieldName("operand");
        if (field) addParsedCall(semantics, seenCalls, field.text, field, operand?.text);
      }
    }
  });

  return semantics;
}
