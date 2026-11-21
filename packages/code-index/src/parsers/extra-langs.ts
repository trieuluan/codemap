import type { WorkspaceFileCandidate } from "../file-discovery.js";
import { EMPTY_SEMANTICS, type ParsedWorkspaceSemantics, type RepoSymbolKind } from "./types.js";
import {
  addParsedCall,
  addParsedImport,
  addParsedSymbol,
  loadWasmLanguage,
  walkTree,
  type SyntaxNode,
} from "./wasm-loader.js";

interface ExtraLangSpec {
  wasm: string;
  packageManager: string;
  symbolNodes: Record<string, RepoSymbolKind>;
  importNodes: string[];
  callNodes: string[];
}

const EXTRA_LANG_SPECS: Record<string, ExtraLangSpec> = {
  Scala: {
    wasm: "tree-sitter-scala.wasm",
    packageManager: "maven",
    symbolNodes: {
      class_definition: "class",
      object_definition: "module",
      trait_definition: "trait",
      function_definition: "function",
      type_definition: "type_alias",
    },
    importNodes: ["import_declaration"],
    callNodes: ["call_expression"],
  },
  Elixir: {
    wasm: "tree-sitter-elixir.wasm",
    packageManager: "hex",
    symbolNodes: {},
    importNodes: [],
    callNodes: ["call"],
  },
  Lua: {
    wasm: "tree-sitter-lua.wasm",
    packageManager: "luarocks",
    symbolNodes: {
      function_definition_statement: "function",
    },
    importNodes: [],
    callNodes: ["call"],
  },
  Zig: {
    wasm: "tree-sitter-zig.wasm",
    packageManager: "zig",
    symbolNodes: {
      function_declaration: "function",
    },
    importNodes: [],
    callNodes: ["call_expression"],
  },
};

function findIdentifierText(node: SyntaxNode): string | null {
  const byField = node.childForFieldName("name") ?? node.childForFieldName("function");
  if (byField) return byField.text;
  const child = node.namedChildren.find((c) =>
    ["identifier", "type_identifier", "IDENTIFIER", "dot_index_expression"].includes(c.type),
  );
  return child?.text ?? null;
}

export async function parseExtraLanguageFile(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  const lang = file.language;
  if (!content.trim() || !lang) return { ...EMPTY_SEMANTICS };

  const spec = EXTRA_LANG_SPECS[lang];
  if (!spec) return { ...EMPTY_SEMANTICS };

  let parser;
  try {
    ({ parser } = await loadWasmLanguage(spec.wasm));
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

  walkTree(tree.rootNode, (node) => {
    // Elixir defines modules/functions/imports via `call` nodes (`defmodule`, `def`, `defp`, `alias`, `import`, `use`)
    if (lang === "Elixir" && node.type === "call") {
      const target = node.childForFieldName("target")?.text;
      const args = node.namedChildren.find((c) => c.type === "arguments");
      const firstArg = args?.namedChild(0)?.text;
      if (target === "defmodule" && firstArg) {
        addParsedSymbol({ semantics, seenSymbols, filePath: file.path, language: lang, kind: "module", displayName: firstArg, node, lines });
        return;
      }
      if ((target === "def" || target === "defp" || target === "defmacro") && firstArg) {
        const fnName = firstArg.replace(/\(.*$/, "").trim();
        addParsedSymbol({ semantics, seenSymbols, filePath: file.path, language: lang, kind: "function", displayName: fnName, node, lines, isExported: target !== "defp" });
        return;
      }
      if ((target === "alias" || target === "import" || target === "use") && firstArg) {
        addParsedImport({ semantics, seenImports, filePath: file.path, projectImportId, moduleSpecifier: firstArg, importKind: "import", node, packageManager: spec.packageManager });
        return;
      }
      if (target) addParsedCall(semantics, seenCalls, target, node);
      return;
    }

    // Zig: `pub const Foo = struct { ... }` and `@import("...")`
    if (lang === "Zig" && node.type === "variable_declaration") {
      const text = node.text;
      const m = text.match(/^(?:pub\s+)?(?:const|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:struct|enum|union)\b/);
      if (m?.[1]) {
        addParsedSymbol({ semantics, seenSymbols, filePath: file.path, language: lang, kind: "class", displayName: m[1], node, lines, isExported: text.startsWith("pub ") });
      }
      const imp = text.match(/@import\("([^"]+)"\)/);
      if (imp?.[1]) {
        addParsedImport({ semantics, seenImports, filePath: file.path, projectImportId, moduleSpecifier: imp[1], importKind: "import", node, packageManager: spec.packageManager });
      }
      return;
    }

    const symKind = spec.symbolNodes[node.type];
    if (symKind) {
      const name = findIdentifierText(node);
      if (name) {
        addParsedSymbol({
          semantics,
          seenSymbols,
          filePath: file.path,
          language: lang,
          kind: symKind,
          displayName: name,
          node,
          lines,
        });
      }
      return;
    }

    if (spec.importNodes.includes(node.type)) {
      const raw = node.text.replace(/^import\s+/, "").trim();
      if (raw) {
        addParsedImport({
          semantics,
          seenImports,
          filePath: file.path,
          projectImportId,
          moduleSpecifier: raw,
          importKind: "import",
          node,
          packageManager: spec.packageManager,
        });
      }
      return;
    }

    if (spec.callNodes.includes(node.type)) {
      const fn = node.childForFieldName("name") ?? node.childForFieldName("function") ?? node.namedChild(0);
      if (fn) {
        const text = fn.text;
        if (lang === "Lua" && text === "require") {
          const arg = node.childForFieldName("arguments")?.namedChild(0)?.text?.replace(/^['"]|['"]$/g, "");
          if (arg) {
            addParsedImport({ semantics, seenImports, filePath: file.path, projectImportId, moduleSpecifier: arg, importKind: "require", node, packageManager: spec.packageManager });
            return;
          }
        }
        addParsedCall(semantics, seenCalls, text, fn);
      }
    }
  });

  return semantics;
}
