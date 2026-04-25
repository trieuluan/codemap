import ts from "typescript";
import type { WorkspaceFileCandidate } from "../file-discovery";
import {
  buildLocalSymbolKey,
  buildStableSymbolKey,
  buildImportLocalKey,
  maskCommentsAndTemplateLiterals,
  resolveRelativeTargetPath,
  resolveTsconfigAliasTargetPath,
  createExternalSymbolDraft,
} from "./shared";
import type { TypeScriptResolverConfig } from "../ts-resolver";
import type {
  ParsedImportDraft,
  ParsedRelationshipDraft,
  ParsedSymbolDraft,
  ParsedWorkspaceSemantics,
} from "./types";

function extractSymbolsWithAst(
  file: WorkspaceFileCandidate,
): { symbols: ParsedSymbolDraft[]; relationships: ParsedRelationshipDraft[] } {
  const content = file.content ?? "";
  const sourceFile = ts.createSourceFile(
    file.baseName,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.extension === "tsx" || file.extension === "jsx"
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );

  const symbols: ParsedSymbolDraft[] = [];
  const relationships: ParsedRelationshipDraft[] = [];
  const lines = content.split(/\r?\n/);

  function getLineCol(pos: number): { line: number; col: number } {
    const lc = sourceFile.getLineAndCharacterOfPosition(pos);
    return { line: lc.line + 1, col: lc.character };
  }

  function getSignature(node: ts.Node): string {
    const { line } = getLineCol(node.getStart(sourceFile));
    return (lines[line - 1] ?? "").trim().slice(0, 200);
  }

  function getReturnType(node: ts.Node): string | null {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      return node.type ? node.type.getText(sourceFile).slice(0, 200) : null;
    }
    return null;
  }

  function getJSDoc(node: ts.Node): string | null {
    const tags = ts.getJSDocCommentsAndTags(node);
    if (tags.length === 0) return null;

    const parts: string[] = [];
    for (const tag of tags) {
      if (ts.isJSDoc(tag) && tag.comment) {
        const text = typeof tag.comment === "string"
          ? tag.comment
          : tag.comment.map((c) => c.text).join("");
        if (text.trim()) parts.push(text.trim());
      }
    }

    return parts.length > 0 ? parts.join("\n").slice(0, 500) : null;
  }

  function pushSymbol(
    name: string,
    kind: ParsedSymbolDraft["kind"],
    node: ts.Node,
    isExported: boolean,
    isDefaultExport: boolean,
  ) {
    const nameStart = content.indexOf(name, node.getStart(sourceFile));
    const { line, col } = nameStart >= 0
      ? getLineCol(nameStart)
      : getLineCol(node.getStart(sourceFile));

    symbols.push({
      localKey: buildLocalSymbolKey(file.path, kind, name),
      stableKey: buildStableSymbolKey(file.path, kind, name, line),
      displayName: name,
      kind,
      language: file.language!,
      signature: getSignature(node),
      returnType: getReturnType(node),
      doc: getJSDoc(node),
      isExported,
      isDefaultExport,
      line,
      col,
      endCol: col + name.length,
    });
  }

  function visitTopLevel(node: ts.Node) {
    if (ts.isExportAssignment(node)) {
      const expr = node.expression;
      if (
        (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr)) &&
        ts.isIdentifier((expr as ts.FunctionExpression).name ?? null as never)
      ) {
        const name = ((expr as ts.FunctionExpression).name as ts.Identifier).text;
        pushSymbol(name, "function", node, true, true);
      }
      return;
    }

    if (!ts.isStatement(node)) return;

    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    const isDefault = modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;

    if (ts.isFunctionDeclaration(node) && node.name) {
      pushSymbol(node.name.text, "function", node, isExported, isDefault);
      return;
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text;
      pushSymbol(name, "class", node, isExported, isDefault);
      const localKey = buildLocalSymbolKey(file.path, "class", name);
      for (const clause of node.heritageClauses ?? []) {
        const kind = clause.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements";
        for (const type of clause.types) {
          const targetName = type.expression.getText(sourceFile);
          relationships.push({ fromSymbolLocalKey: localKey, toSymbolName: targetName, relationshipKind: kind });
        }
      }
      return;
    }

    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      pushSymbol(name, "interface", node, isExported, false);
      const localKey = buildLocalSymbolKey(file.path, "interface", name);
      for (const clause of node.heritageClauses ?? []) {
        for (const type of clause.types) {
          const targetName = type.expression.getText(sourceFile);
          relationships.push({ fromSymbolLocalKey: localKey, toSymbolName: targetName, relationshipKind: "extends" });
        }
      }
      return;
    }

    if (ts.isTypeAliasDeclaration(node)) {
      pushSymbol(node.name.text, "type_alias", node, isExported, false);
      return;
    }

    if (ts.isEnumDeclaration(node)) {
      pushSymbol(node.name.text, "enum", node, isExported, false);
      return;
    }

    if (ts.isVariableStatement(node) && isExported) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;

        const isPascalCase = /^[A-Z]/.test(name);
        let kind: ParsedSymbolDraft["kind"] = "variable";
        if (isPascalCase) {
          kind = "component";
        } else if (
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          kind = "function";
        }

        pushSymbol(name, kind, decl, isExported, false);
      }
    }
  }

  ts.forEachChild(sourceFile, visitTopLevel);
  return { symbols, relationships };
}

export function parseTypeScriptOrJavaScriptFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
  workspacePath: string,
  resolverConfigs: TypeScriptResolverConfig[],
): ParsedWorkspaceSemantics {
  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    issues: [],
    externalSymbols: [],
  };
  const lines = maskCommentsAndTemplateLiterals(file.content ?? "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    const pushImport = (
      moduleSpecifier: string,
      importKind: ParsedImportDraft["importKind"],
      isTypeOnly: boolean,
      matchIndex: number,
    ) => {
      const isRelative = moduleSpecifier.startsWith(".");
      const aliasResolution = !isRelative
        ? resolveTsconfigAliasTargetPath(workspacePath, file.path, moduleSpecifier, file.language!, filePathSet, resolverConfigs)
        : null;
      const resolution = isRelative
        ? resolveRelativeTargetPath(file.path, moduleSpecifier, file.language!, filePathSet)
        : (aliasResolution ?? { resolvedPath: null, attemptedPath: null });
      const importLocalKey = buildImportLocalKey(file.path, importKind, moduleSpecifier, lineNumber, matchIndex);

      semantics.imports.push({
        localKey: importLocalKey,
        moduleSpecifier,
        importKind,
        isTypeOnly,
        line: lineNumber,
        col: matchIndex,
        endCol: matchIndex + moduleSpecifier.length,
        resolutionKind: isRelative
          ? resolution.resolvedPath ? "relative_path" : "unresolved"
          : aliasResolution?.resolvedPath ? "tsconfig_alias"
          : aliasResolution?.matched ? "unresolved" : "package",
        targetPathText: resolution.resolvedPath ?? resolution.attemptedPath,
        targetExternalSymbolKey: isRelative || aliasResolution?.matched
          ? null
          : `${file.language?.toLowerCase()}:${moduleSpecifier}`,
      });

      if (!isRelative && !aliasResolution?.matched) {
        semantics.externalSymbols.push(createExternalSymbolDraft(projectImportId, file.language!, moduleSpecifier));
      } else if (!resolution.resolvedPath) {
        semantics.issues.push({
          projectImportId,
          severity: "warning",
          code: "UNRESOLVED_IMPORT",
          message: `Unable to resolve module "${moduleSpecifier}" from ${file.path}`,
          detailJson: { filePath: file.path, moduleSpecifier },
        });
      }

      return importLocalKey;
    };

    for (const match of line.matchAll(/\bimport\s+(type\s+)?(?:[^'"]+?\s+from\s+)?["']([^"']+)["']/g)) {
      const moduleSpecifier = match[2];
      if (!moduleSpecifier) continue;
      pushImport(moduleSpecifier, "import", Boolean(match[1]), match.index ?? 0);
    }

    for (const match of line.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!match[1]) continue;
      pushImport(match[1], "require", false, match.index ?? 0);
    }

    for (const match of line.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!match[1]) continue;
      pushImport(match[1], "dynamic_import", false, match.index ?? 0);
    }

    for (const match of line.matchAll(/\bexport\s+(type\s+)?\*\s+from\s+["']([^"']+)["']/g)) {
      if (!match[2]) continue;
      const importLocalKey = pushImport(match[2], "export_from", Boolean(match[1]), match.index ?? 0);
      semantics.exports.push({
        exportName: "*",
        exportKind: "wildcard",
        line: lineNumber,
        col: match.index ?? 0,
        endCol: (match.index ?? 0) + match[0].length,
        sourceImportLocalKey: importLocalKey,
        targetExternalSymbolKey: match[2].startsWith(".") ? null : `${file.language?.toLowerCase()}:${match[2]}`,
      });
    }

    for (const match of line.matchAll(/\bexport\s+(type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g)) {
      if (!match[3]) continue;
      const importLocalKey = pushImport(match[3], "export_from", Boolean(match[1]), match.index ?? 0);
      const exportedItems = match[2].split(",").map((item) => item.trim()).filter(Boolean);

      for (const exportedItem of exportedItems) {
        const [, exportName] = exportedItem.match(/^(?:.+\s+as\s+)?([A-Za-z_$][\w$]*)$/) ?? [];
        semantics.exports.push({
          exportName: exportName ?? exportedItem,
          exportKind: "re_export",
          line: lineNumber,
          col: match.index ?? 0,
          endCol: (match.index ?? 0) + match[0].length,
          sourceImportLocalKey: importLocalKey,
          targetExternalSymbolKey: match[3].startsWith(".") ? null : `${file.language?.toLowerCase()}:${match[3]}`,
        });
      }
    }

    const namedExportMatch = line.match(/^\s*export\s+\{([^}]+)\}/);
    if (namedExportMatch?.[1]) {
      const exportedItems = namedExportMatch[1].split(",").map((item) => item.trim()).filter(Boolean);
      for (const exportedItem of exportedItems) {
        const renameMatch = exportedItem.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (!renameMatch?.[1]) continue;
        semantics.exports.push({
          exportName: renameMatch[2] ?? renameMatch[1],
          exportKind: "named",
          line: lineNumber,
          col: line.indexOf(exportedItem),
          endCol: line.indexOf(exportedItem) + exportedItem.length,
          symbolLocalKey: buildLocalSymbolKey(file.path, "variable", renameMatch[1]),
        });
      }
    }
  });

  const { symbols: astSymbols, relationships: astRelationships } = extractSymbolsWithAst(file);
  for (const symbol of astSymbols) {
    semantics.symbols.push(symbol);
    if (symbol.isExported) {
      semantics.exports.push({
        exportName: symbol.isDefaultExport ? "default" : symbol.displayName,
        exportKind: symbol.isDefaultExport ? "default" : "named",
        line: symbol.line,
        col: symbol.col,
        endCol: symbol.endCol,
        symbolLocalKey: symbol.localKey,
      });
    }
  }
  semantics.relationships.push(...astRelationships);

  return semantics;
}
