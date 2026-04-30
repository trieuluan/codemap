import ts from "typescript";
import type { WorkspaceFileCandidate } from "../file-discovery";
import {
  buildLocalSymbolKey,
  buildStableSymbolKey,
  buildImportLocalKey,
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

function createSourceFile(file: WorkspaceFileCandidate): ts.SourceFile {
  return ts.createSourceFile(
    file.baseName,
    file.content ?? "",
    ts.ScriptTarget.Latest,
    true,
    file.extension === "tsx" || file.extension === "jsx"
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );
}

function getLineCol(
  sourceFile: ts.SourceFile,
  pos: number,
): { line: number; col: number } {
  const lc = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, col: lc.character };
}

// ─── Import/export extraction ─────────────────────────────────────────────────

function extractImportsWithAst(
  file: WorkspaceFileCandidate,
  sourceFile: ts.SourceFile,
  filePathSet: Set<string>,
  projectImportId: string,
  workspacePath: string,
  resolverConfigs: TypeScriptResolverConfig[],
): Pick<ParsedWorkspaceSemantics, "imports" | "exports" | "issues" | "externalSymbols"> {
  const imports: ParsedImportDraft[] = [];
  const exports: ParsedWorkspaceSemantics["exports"] = [];
  const issues: ParsedWorkspaceSemantics["issues"] = [];
  const externalSymbols: ParsedWorkspaceSemantics["externalSymbols"] = [];

  const pushImport = (
    moduleSpecifier: string,
    importKind: ParsedImportDraft["importKind"],
    isTypeOnly: boolean,
    startPos: number,
    importedNames: string[],
  ): string => {
    const { line, col } = getLineCol(sourceFile, startPos);
    const isRelative = moduleSpecifier.startsWith(".");
    const aliasResolution = !isRelative
      ? resolveTsconfigAliasTargetPath(workspacePath, file.path, moduleSpecifier, file.language!, filePathSet, resolverConfigs)
      : null;
    const resolution = isRelative
      ? resolveRelativeTargetPath(file.path, moduleSpecifier, file.language!, filePathSet)
      : (aliasResolution ?? { resolvedPath: null, attemptedPath: null });
    const importLocalKey = buildImportLocalKey(file.path, importKind, moduleSpecifier, line, col);

    imports.push({
      localKey: importLocalKey,
      moduleSpecifier,
      importKind,
      isTypeOnly,
      importedNames,
      line,
      col,
      endCol: col + moduleSpecifier.length,
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
      externalSymbols.push(createExternalSymbolDraft(projectImportId, file.language!, moduleSpecifier));
    } else if (!resolution.resolvedPath) {
      issues.push({
        projectImportId,
        severity: "warning",
        code: "UNRESOLVED_IMPORT",
        message: `Unable to resolve module "${moduleSpecifier}" from ${file.path}`,
        detailJson: { filePath: file.path, moduleSpecifier },
      });
    }

    return importLocalKey;
  };

  function getModuleSpecifier(node: ts.ImportDeclaration | ts.ExportDeclaration): string | null {
    const spec = node.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec)) return null;
    return spec.text;
  }

  function extractNamedBindings(clause: ts.NamedImports | ts.NamedExports): string[] {
    return clause.elements.map((el) => {
      // el.name is the local alias; el.propertyName is the original — we want the original
      if ("propertyName" in el && el.propertyName) {
        return (el.propertyName as ts.Identifier).text;
      }
      return (el.name as ts.Identifier).text;
    });
  }

  ts.forEachChild(sourceFile, (node) => {
    // import ... from '...'
    if (ts.isImportDeclaration(node)) {
      const specifier = getModuleSpecifier(node);
      if (!specifier) return;

      const isTypeOnly = node.importClause?.isTypeOnly ?? false;
      const clause = node.importClause;
      const importedNames: string[] = [];

      if (clause) {
        // import Foo from '...' — default import, no named
        // import { A, B } from '...'
        if (clause.namedBindings) {
          if (ts.isNamedImports(clause.namedBindings)) {
            importedNames.push(...extractNamedBindings(clause.namedBindings));
          }
          // import * as ns — namespace import, importedNames stays []
        }
      }

      pushImport(specifier, "import", isTypeOnly, node.getStart(sourceFile), importedNames);
      return;
    }

    // export { A } from '...' / export * from '...' / export { A } (local)
    if (ts.isExportDeclaration(node)) {
      const specifier = getModuleSpecifier(node);
      const { line, col } = getLineCol(sourceFile, node.getStart(sourceFile));
      const endCol = col + node.getWidth(sourceFile);

      if (!specifier) {
        // export { A, B } — local, no from
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            const localName = el.propertyName?.text ?? el.name.text;
            const exportName = el.name.text;
            exports.push({
              exportName,
              exportKind: "named",
              line,
              col,
              endCol,
              symbolLocalKey: buildLocalSymbolKey(file.path, "variable", localName),
            });
          }
        }
        return;
      }

      const isTypeOnly = node.isTypeOnly;

      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        // export { A, B } from '...'
        const importLocalKey = pushImport(specifier, "export_from", isTypeOnly, node.getStart(sourceFile), []);
        for (const el of node.exportClause.elements) {
          exports.push({
            exportName: el.name.text,
            exportKind: "re_export",
            line,
            col,
            endCol,
            sourceImportLocalKey: importLocalKey,
            targetExternalSymbolKey: specifier.startsWith(".") ? null : `${file.language?.toLowerCase()}:${specifier}`,
          });
        }
      } else {
        // export * from '...'
        const importLocalKey = pushImport(specifier, "export_from", isTypeOnly, node.getStart(sourceFile), []);
        exports.push({
          exportName: "*",
          exportKind: "wildcard",
          line,
          col,
          endCol,
          sourceImportLocalKey: importLocalKey,
          targetExternalSymbolKey: specifier.startsWith(".") ? null : `${file.language?.toLowerCase()}:${specifier}`,
        });
      }
      return;
    }

    // require('...') and import('...') via CallExpression — walk full subtree
    function walkForCalls(n: ts.Node) {
      if (ts.isCallExpression(n)) {
        const expr = n.expression;
        const args = n.arguments;
        if (args.length === 1 && ts.isStringLiteral(args[0])) {
          const specifier = (args[0] as ts.StringLiteral).text;
          if (ts.isIdentifier(expr) && expr.text === "require") {
            pushImport(specifier, "require", false, n.getStart(sourceFile), []);
          } else if (expr.kind === ts.SyntaxKind.ImportKeyword) {
            pushImport(specifier, "dynamic_import", false, n.getStart(sourceFile), []);
          }
        }
      }
      ts.forEachChild(n, walkForCalls);
    }

    // Only walk statements that aren't import/export declarations (already handled)
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) {
      walkForCalls(node);
    }
  });

  return { imports, exports, issues, externalSymbols };
}

// ─── Symbol extraction ────────────────────────────────────────────────────────

function extractSymbolsWithAst(
  file: WorkspaceFileCandidate,
  sourceFile: ts.SourceFile,
): { symbols: ParsedSymbolDraft[]; relationships: ParsedRelationshipDraft[] } {
  const content = file.content ?? "";
  const symbols: ParsedSymbolDraft[] = [];
  const relationships: ParsedRelationshipDraft[] = [];
  const lines = content.split(/\r?\n/);

  function getSignature(node: ts.Node): string {
    const { line } = getLineCol(sourceFile, node.getStart(sourceFile));
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
      ? getLineCol(sourceFile, nameStart)
      : getLineCol(sourceFile, node.getStart(sourceFile));

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

  // ─── Factory return-object method extraction (heuristic #1 + type-driven #2) ──

  function getReturnedObjectLiteral(
    body: ts.Block | ts.Expression | undefined,
  ): ts.ObjectLiteralExpression | null {
    if (!body) return null;
    // Arrow function shorthand: () => ({ ... })
    if (ts.isParenthesizedExpression(body)) {
      const inner = body.expression;
      return ts.isObjectLiteralExpression(inner) ? inner : null;
    }
    if (ts.isObjectLiteralExpression(body)) return body;
    if (!ts.isBlock(body)) return null;

    // Block body: find the last return statement
    let returnedObj: ts.ObjectLiteralExpression | null = null;
    for (const stmt of body.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        const expr = ts.isParenthesizedExpression(stmt.expression)
          ? stmt.expression.expression
          : stmt.expression;
        if (ts.isObjectLiteralExpression(expr)) {
          returnedObj = expr;
        }
      }
    }
    return returnedObj;
  }

  // Heuristic #2: if the function has a return type annotation that is a TypeLiteral
  // (e.g., ): { foo(): void; bar(): string }), extract allowed method names from it.
  // Returns null if no type annotation or annotation is not a resolvable object type.
  function getAllowedNamesFromReturnType(
    node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  ): Set<string> | null {
    if (!node.type) return null;
    // ): { method1(): T; method2(): U }
    if (ts.isTypeLiteralNode(node.type)) {
      const names = new Set<string>();
      for (const member of node.type.members) {
        if (
          (ts.isMethodSignature(member) || ts.isPropertySignature(member)) &&
          ts.isIdentifier(member.name)
        ) {
          names.add(member.name.text);
        }
      }
      return names.size > 0 ? names : null;
    }
    return null;
  }

  function extractReturnObjectMethods(
    fnNode: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
    parentLocalKey: string,
    isParentExported: boolean,
  ) {
    const body = fnNode.body;
    const obj = getReturnedObjectLiteral(body);
    if (!obj) return;

    const allowedNames = getAllowedNamesFromReturnType(fnNode);

    for (const prop of obj.properties) {
      let name: string | null = null;
      let methodNode: ts.Node = prop;
      let isMethod = false;

      if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name)) {
        name = prop.name.text;
        isMethod = true;
      } else if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const init = prop.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          name = prop.name.text;
          methodNode = prop;
          isMethod = true;
        }
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        // { foo } — reference to existing symbol, not a new method definition, skip
      }

      if (!name || !isMethod) continue;
      // If type annotation present, only index names that appear in it
      if (allowedNames && !allowedNames.has(name)) continue;

      const { line, col } = getLineCol(sourceFile, methodNode.getStart(sourceFile));
      symbols.push({
        localKey: buildLocalSymbolKey(file.path, "method", name),
        stableKey: buildStableSymbolKey(file.path, "method", name, line),
        displayName: name,
        kind: "method",
        language: file.language!,
        signature: getSignature(methodNode),
        returnType: getReturnType(
          ts.isMethodDeclaration(prop)
            ? prop
            : ts.isPropertyAssignment(prop)
              ? (prop.initializer as ts.ArrowFunction | ts.FunctionExpression)
              : prop as ts.Node,
        ),
        doc: getJSDoc(prop),
        isExported: isParentExported,
        isDefaultExport: false,
        line,
        col,
        endCol: col + name.length,
        parentSymbolLocalKey: parentLocalKey,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

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
      const name = node.name.text;
      pushSymbol(name, "function", node, isExported, isDefault);
      const localKey = buildLocalSymbolKey(file.path, "function", name);
      extractReturnObjectMethods(node, localKey, isExported);
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
        if (
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          const localKey = buildLocalSymbolKey(file.path, kind, name);
          extractReturnObjectMethods(decl.initializer, localKey, isExported);
        }
      }
    }
  }

  ts.forEachChild(sourceFile, visitTopLevel);
  return { symbols, relationships };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function parseTypeScriptOrJavaScriptFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
  workspacePath: string,
  resolverConfigs: TypeScriptResolverConfig[],
): ParsedWorkspaceSemantics {
  const sourceFile = createSourceFile(file);

  const { imports, exports, issues, externalSymbols } = extractImportsWithAst(
    file, sourceFile, filePathSet, projectImportId, workspacePath, resolverConfigs,
  );

  const { symbols: astSymbols, relationships } = extractSymbolsWithAst(file, sourceFile);

  const symbolExports: ParsedWorkspaceSemantics["exports"] = astSymbols
    .filter((s) => s.isExported)
    .map((s) => ({
      exportName: s.isDefaultExport ? "default" : s.displayName,
      exportKind: s.isDefaultExport ? "default" : "named",
      line: s.line,
      col: s.col,
      endCol: s.endCol,
      symbolLocalKey: s.localKey,
    }));

  return {
    symbols: astSymbols,
    imports,
    exports: [...exports, ...symbolExports],
    relationships,
    issues,
    externalSymbols,
  };
}
