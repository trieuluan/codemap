import path from "node:path";
import type { WorkspaceFileCandidate } from "../file-discovery.js";
import {
  EMPTY_SEMANTICS,
  type ParsedWorkspaceSemantics,
} from "./types.js";
import {
  addParsedCall,
  addParsedImport,
  addParsedSymbol,
  loadWasmLanguage,
  walkTree,
  type SyntaxNode,
} from "./wasm-loader.js";

function hasPubVisibility(node: SyntaxNode): boolean {
  for (let i = 0; i < node.namedChildCount; i++) {
    if (node.namedChild(i)?.type === "visibility_modifier") return true;
  }
  return false;
}

function resolveRustModPath(
  sourceFilePath: string,
  modName: string,
  filePathSet: Set<string>,
): string | null {
  const dir = path.posix.dirname(sourceFilePath);
  const base = path.posix.basename(sourceFilePath);
  const subDir =
    base === "mod.rs" || base === "lib.rs" || base === "main.rs"
      ? dir
      : path.posix.join(dir, base.replace(/\.rs$/, ""));

  const candidates = [
    path.posix.normalize(path.posix.join(subDir, `${modName}.rs`)),
    path.posix.normalize(path.posix.join(subDir, modName, "mod.rs")),
  ];
  return candidates.find((c) => filePathSet.has(c)) ?? null;
}

function resolveRustUsePath(
  sourceFilePath: string,
  specifier: string,
  filePathSet: Set<string>,
): string | null {
  const clean = specifier.replace(/::\{.*$/, "").replace(/::\*$/, "");
  const parts = clean.split("::").filter(Boolean);
  if (parts.length === 0) return null;

  let baseDir: string | null = null;
  let rest = parts;
  if (parts[0] === "crate") {
    const srcIdx = sourceFilePath.indexOf("/src/");
    baseDir = srcIdx >= 0 ? sourceFilePath.slice(0, srcIdx + 4) : "src";
    rest = parts.slice(1);
  } else if (parts[0] === "self") {
    baseDir = path.posix.dirname(sourceFilePath);
    rest = parts.slice(1);
  } else if (parts[0] === "super") {
    baseDir = path.posix.dirname(path.posix.dirname(sourceFilePath));
    rest = parts.slice(1);
  } else {
    return null;
  }

  for (let len = rest.length; len >= 1; len--) {
    const segs = rest.slice(0, len);
    const rel = path.posix.normalize(path.posix.join(baseDir, ...segs));
    const candidates = [`${rel}.rs`, path.posix.join(rel, "mod.rs")];
    const hit = candidates.find((c) => filePathSet.has(c));
    if (hit) return hit;
  }
  return null;
}

export async function parseRustFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): Promise<ParsedWorkspaceSemantics> {
  const content = file.content ?? "";
  if (!content.trim()) return { ...EMPTY_SEMANTICS };

  let parser;
  try {
    ({ parser } = await loadWasmLanguage("tree-sitter-rust.wasm"));
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
    const lang = file.language ?? "Rust";

    if (node.type === "struct_item" || node.type === "enum_item" || node.type === "trait_item" || node.type === "type_item") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;
      const kind =
        node.type === "struct_item" ? "class"
        : node.type === "enum_item" ? "enum"
        : node.type === "trait_item" ? "trait"
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
        isExported: hasPubVisibility(node),
      });
      return;
    }

    if (node.type === "function_item") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;
      const inImplOrTrait =
        node.parent?.type === "declaration_list" &&
        (node.parent.parent?.type === "impl_item" || node.parent.parent?.type === "trait_item");
      let parentKey: string | undefined;
      if (inImplOrTrait && node.parent?.parent) {
        const ownerNode = node.parent.parent;
        const ownerName =
          ownerNode.childForFieldName("type")?.text ??
          ownerNode.childForFieldName("name")?.text;
        if (ownerName) {
          parentKey = `${file.path}#${ownerNode.type === "trait_item" ? "trait" : "class"}:${ownerName}`;
        }
      }
      addParsedSymbol({
        semantics,
        seenSymbols,
        filePath: file.path,
        language: lang,
        kind: inImplOrTrait ? "method" : "function",
        displayName: nameNode.text,
        node,
        lines,
        isExported: hasPubVisibility(node) || inImplOrTrait,
        parentSymbolLocalKey: parentKey,
      });
      return;
    }

    if (node.type === "impl_item") {
      const typeNode = node.childForFieldName("type");
      const traitNode = node.childForFieldName("trait");
      if (typeNode && traitNode) {
        semantics.relationships.push({
          fromSymbolLocalKey: `${file.path}#class:${typeNode.text}`,
          toSymbolName: traitNode.text,
          relationshipKind: "implements",
        });
      }
      return;
    }

    if (node.type === "mod_item") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;
      const hasBody = Boolean(node.childForFieldName("body"));
      if (hasBody) {
        addParsedSymbol({
          semantics,
          seenSymbols,
          filePath: file.path,
          language: lang,
          kind: "module",
          displayName: nameNode.text,
          node,
          lines,
          isExported: hasPubVisibility(node),
        });
      } else {
        const target = resolveRustModPath(file.path, nameNode.text, filePathSet);
        addParsedImport({
          semantics,
          seenImports,
          filePath: file.path,
          projectImportId,
          moduleSpecifier: `mod ${nameNode.text}`,
          importKind: "use",
          node,
          importedNames: [nameNode.text],
          resolutionKind: target ? "relative_path" : "unresolved",
          targetPathText: target,
        });
      }
      return;
    }

    if (node.type === "use_declaration") {
      const arg = node.childForFieldName("argument");
      if (!arg) return;
      const spec = arg.text;
      const target = resolveRustUsePath(file.path, spec, filePathSet);
      addParsedImport({
        semantics,
        seenImports,
        filePath: file.path,
        projectImportId,
        moduleSpecifier: spec,
        importKind: "use",
        node,
        resolutionKind: target ? "relative_path" : "package",
        targetPathText: target,
        packageManager: "cargo",
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
      } else if (fnNode.type === "scoped_identifier") {
        const name = fnNode.childForFieldName("name");
        const scope = fnNode.childForFieldName("path");
        if (name) addParsedCall(semantics, seenCalls, name.text, name, scope?.text);
      }
    }
  });

  return semantics;
}
