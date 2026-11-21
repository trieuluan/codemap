import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { resolveRelativeTargetPath } from "./shared.js";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics } from "./types.js";
import {
  addParsedCall,
  addParsedImport,
  addParsedSymbol,
  loadWasmLanguage,
  walkTree,
} from "./wasm-loader.js";

export async function parseRubyFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser;
  try {
    ({ parser } = await loadWasmLanguage("tree-sitter-ruby.wasm"));
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
  const lang = file.language ?? "Ruby";

  walkTree(tree.rootNode, (node) => {
    if (node.type === "class" || node.type === "module") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;
      addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind: node.type === "module" ? "module" : "class",
        displayName: nameNode.text,
        node,
        lines,
      });
      return;
    }

    if (node.type === "method" || node.type === "singleton_method") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;
      addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind: "method",
        displayName: nameNode.text,
        node,
        lines,
      });
      return;
    }

    if (node.type === "call") {
      const methodNode = node.childForFieldName("method");
      if (!methodNode) return;
      const methodName = methodNode.text;
      if (methodName === "require" || methodName === "require_relative") {
        const args = node.childForFieldName("arguments");
        const firstArg = args?.namedChild(0);
        const raw = firstArg?.text?.replace(/^['"]|['"]$/g, "");
        if (raw) {
          const isRel = methodName === "require_relative" || raw.startsWith(".");
          const resolved = isRel
            ? resolveRelativeTargetPath(file.path, raw, lang, filePathSet).resolvedPath
            : null;
          addParsedImport({
            semantics,
            seenImports,
            filePath: file.path,
            projectImportId,
            moduleSpecifier: raw,
            importKind: "require",
            node,
            resolutionKind: resolved ? "relative_path" : isRel ? "unresolved" : "package",
            targetPathText: resolved,
            packageManager: "rubygems",
          });
          return;
        }
      }
      const receiver = node.childForFieldName("receiver");
      addParsedCall(semantics, seenCalls, methodName, methodNode, receiver?.text);
    }
  });

  return semantics;
}
