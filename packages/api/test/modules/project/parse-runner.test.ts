import * as assert from "node:assert";
import { test } from "node:test";
import { parseWorkspaceFileSemantics } from "@codemap/code-index";

test("parseWorkspaceFileSemantics extracts basic TypeScript imports, symbols, and exports", async () => {
  const semantics = await parseWorkspaceFileSemantics({
    projectImportId: "import-1",
    workspacePath: "/tmp",
    resolverConfigs: [],
    filePathSet: new Set(["src/utils.ts"]),
    file: {
      path: "src/index.ts",
      absolutePath: "/tmp/src/index.ts",
      dirPath: "src",
      baseName: "index.ts",
      extension: "ts",
      language: "TypeScript",
      mimeType: "text/plain",
      sizeBytes: 120,
      contentSha256: "abc",
      isText: true,
      isBinary: false,
      isGenerated: false,
      isIgnored: false,
      ignoreReason: null,
      isParseable: true,
      parseStatus: "parsed",
      parserName: "codemap-regex-parser",
      parserVersion: "0.1.0",
      lineCount: 3,
      content: [
        "import { helper } from './utils';",
        "export interface ServiceContract {}",
        "export class ExampleService {}",
      ].join("\n"),
    },
  });

  assert.equal(semantics.imports.length, 1);
  assert.equal(semantics.imports[0]?.moduleSpecifier, "./utils");
  assert.equal(semantics.imports[0]?.resolutionKind, "relative_path");
  assert.equal(semantics.symbols.length, 2);
  assert.equal(semantics.symbols[0]?.kind, "interface");
  assert.equal(semantics.symbols[1]?.kind, "class");
  assert.equal(semantics.exports.length, 2);
  assert.equal(semantics.issues.length, 0);
});

test("parseWorkspaceFileSemantics extracts Dart and Flutter imports and declarations", async () => {
  const semantics = await parseWorkspaceFileSemantics({
    projectImportId: "import-1",
    workspacePath: "/tmp",
    resolverConfigs: [],
    filePathSet: new Set([
      "lib/app_state.g.dart",
      "lib/src/models.dart",
    ]),
    file: {
      path: "lib/main.dart",
      absolutePath: "/tmp/lib/main.dart",
      dirPath: "lib",
      baseName: "main.dart",
      extension: "dart",
      language: "Dart",
      mimeType: "text/plain",
      sizeBytes: 120,
      contentSha256: "abc",
      isText: true,
      isBinary: false,
      isGenerated: false,
      isIgnored: false,
      ignoreReason: null,
      isParseable: true,
      parseStatus: "parsed",
      parserName: "codemap-regex-parser",
      parserVersion: "0.1.0",
      lineCount: 18,
      content: [
        "import 'dart:async';",
        "import 'package:flutter/material.dart';",
        "import 'package:sample_app/src/models.dart';",
        "export 'src/models.dart';",
        "part 'app_state.g.dart';",
        "",
        "class App extends StatelessWidget {",
        "  const App({super.key});",
        "",
        "  @override",
        "  Widget build(BuildContext context) {",
        "    return const SizedBox.shrink();",
        "  }",
        "}",
        "",
        "mixin Loadable {}",
        "enum LoadState { idle, loading }",
        "typedef WidgetBuilderFactory = Widget Function();",
      ].join("\n"),
    },
  });

  assert.equal(semantics.imports.length, 5);
  assert.equal(semantics.imports[0]?.importKind, "import");
  assert.equal(semantics.imports[0]?.resolutionKind, "builtin");
  assert.equal(semantics.imports[1]?.resolutionKind, "package");
  assert.equal(semantics.imports[2]?.targetPathText, "lib/src/models.dart");
  assert.equal(semantics.imports[3]?.importKind, "export_from");
  assert.equal(semantics.imports[4]?.importKind, "include");
  assert.equal(semantics.imports[4]?.targetPathText, "lib/app_state.g.dart");
  assert.equal(semantics.exports.length, 1);
  assert.equal(semantics.externalSymbols.length, 2);

  const symbolsByName = new Map(semantics.symbols.map((symbol) => [symbol.displayName, symbol]));
  assert.equal(symbolsByName.get("App")?.kind, "class");
  assert.equal(symbolsByName.get("build")?.kind, "method");
  assert.equal(symbolsByName.get("Loadable")?.kind, "mixin");
  assert.equal(symbolsByName.get("LoadState")?.kind, "enum");
  assert.equal(symbolsByName.get("WidgetBuilderFactory")?.kind, "type_alias");
});

test("parseWorkspaceFileSemantics extracts PHP namespaces, use statements, and symbols", async () => {
  const semantics = await parseWorkspaceFileSemantics({
    projectImportId: "import-1",
    workspacePath: "/tmp",
    resolverConfigs: [],
    filePathSet: new Set(),
    file: {
      path: "src/Service.php",
      absolutePath: "/tmp/src/Service.php",
      dirPath: "src",
      baseName: "Service.php",
      extension: "php",
      language: "PHP",
      mimeType: "text/x-php",
      sizeBytes: 120,
      contentSha256: "abc",
      isText: true,
      isBinary: false,
      isGenerated: false,
      isIgnored: false,
      ignoreReason: null,
      isParseable: true,
      parseStatus: "parsed",
      parserName: "codemap-regex-parser",
      parserVersion: "0.1.0",
      lineCount: 4,
      content: [
        "<?php",
        "namespace App\\\\Service;",
        "use Vendor\\\\Package\\\\Client;",
        "class ExampleService {}",
      ].join("\n"),
    },
  });

  assert.equal(semantics.imports.length, 1);
  assert.equal(semantics.imports[0]?.importKind, "use");
  assert.equal(semantics.externalSymbols.length, 1);
  assert.equal(semantics.symbols.length, 2);
  assert.equal(semantics.symbols[0]?.kind, "namespace");
  assert.equal(semantics.symbols[1]?.displayName, "ExampleService");
});

test("parseWorkspaceFileSemantics extracts Java Android imports and symbols", async () => {
  const semantics = await parseWorkspaceFileSemantics({
    projectImportId: "import-1",
    workspacePath: "/tmp",
    resolverConfigs: [],
    filePathSet: new Set(),
    file: {
      path: "android/app/src/main/java/com/example/app/MainActivity.java",
      absolutePath: "/tmp/android/app/src/main/java/com/example/app/MainActivity.java",
      dirPath: "android/app/src/main/java/com/example/app",
      baseName: "MainActivity.java",
      extension: "java",
      language: "Java",
      mimeType: "text/x-java-source",
      sizeBytes: 220,
      contentSha256: "abc",
      isText: true,
      isBinary: false,
      isGenerated: false,
      isIgnored: false,
      ignoreReason: null,
      isParseable: true,
      parseStatus: "parsed",
      parserName: "codemap-regex-parser",
      parserVersion: "0.1.0",
      lineCount: 10,
      content: [
        "package com.example.app;",
        "",
        "import android.os.Bundle;",
        "import io.flutter.embedding.android.FlutterActivity;",
        "",
        "public class MainActivity extends FlutterActivity {",
        "  @Override",
        "  protected void onCreate(Bundle savedInstanceState) {",
        "    super.onCreate(savedInstanceState);",
        "  }",
        "}",
      ].join("\n"),
    },
  });

  assert.equal(semantics.imports.length, 2);
  assert.equal(semantics.imports[0]?.moduleSpecifier, "android.os.Bundle");
  assert.equal(semantics.externalSymbols.length, 2);

  const symbolsByName = new Map(semantics.symbols.map((symbol) => [symbol.displayName, symbol]));
  assert.equal(symbolsByName.get("com.example.app")?.kind, "namespace");
  assert.equal(symbolsByName.get("MainActivity")?.kind, "class");
  assert.equal(symbolsByName.get("onCreate")?.kind, "method");
});

test("parseWorkspaceFileSemantics extracts Kotlin Android imports and symbols", async () => {
  const semantics = await parseWorkspaceFileSemantics({
    projectImportId: "import-1",
    workspacePath: "/tmp",
    resolverConfigs: [],
    filePathSet: new Set(),
    file: {
      path: "android/app/src/main/kotlin/com/example/app/MainActivity.kt",
      absolutePath: "/tmp/android/app/src/main/kotlin/com/example/app/MainActivity.kt",
      dirPath: "android/app/src/main/kotlin/com/example/app",
      baseName: "MainActivity.kt",
      extension: "kt",
      language: "Kotlin",
      mimeType: "text/x-kotlin",
      sizeBytes: 220,
      contentSha256: "abc",
      isText: true,
      isBinary: false,
      isGenerated: false,
      isIgnored: false,
      ignoreReason: null,
      isParseable: true,
      parseStatus: "parsed",
      parserName: "codemap-regex-parser",
      parserVersion: "0.1.0",
      lineCount: 10,
      content: [
        "package com.example.app",
        "",
        "import android.os.Bundle",
        "import io.flutter.embedding.android.FlutterActivity",
        "",
        "class MainActivity : FlutterActivity() {",
        "  private val channelName = \"app/channel\"",
        "  override fun onCreate(savedInstanceState: Bundle?) {",
        "    super.onCreate(savedInstanceState)",
        "  }",
        "}",
        "",
        "fun configureApp() = Unit",
      ].join("\n"),
    },
  });

  assert.equal(semantics.imports.length, 2);
  assert.equal(semantics.imports[1]?.moduleSpecifier, "io.flutter.embedding.android.FlutterActivity");
  assert.equal(semantics.externalSymbols.length, 2);

  const symbolsByName = new Map(semantics.symbols.map((symbol) => [symbol.displayName, symbol]));
  assert.equal(symbolsByName.get("com.example.app")?.kind, "namespace");
  assert.equal(symbolsByName.get("MainActivity")?.kind, "class");
  assert.equal(symbolsByName.get("channelName")?.kind, "property");
  assert.equal(symbolsByName.get("onCreate")?.kind, "method");
  assert.equal(symbolsByName.get("configureApp")?.kind, "function");
});

test("parseWorkspaceFileSemantics resolves tsconfig path aliases for internal imports", async () => {
  const semantics = await parseWorkspaceFileSemantics({
    projectImportId: "import-1",
    workspacePath: "/tmp/repo",
    resolverConfigs: [
      {
        configPath: "/tmp/repo/packages/web/tsconfig.json",
        configDirPath: "/tmp/repo/packages/web",
        configDirRelativePath: "packages/web",
        baseUrlPath: "/tmp/repo/packages/web",
        pathAliases: [
          {
            pattern: "@/*",
            hasWildcard: true,
            prefix: "@/",
            suffix: "",
            targets: ["./*"],
          },
        ],
      },
    ],
    filePathSet: new Set([
      "packages/web/hooks/useAuth.ts",
      "packages/web/app/page.tsx",
    ]),
    file: {
      path: "packages/web/app/page.tsx",
      absolutePath: "/tmp/repo/packages/web/app/page.tsx",
      dirPath: "packages/web/app",
      baseName: "page.tsx",
      extension: "tsx",
      language: "TypeScript",
      mimeType: "text/plain",
      sizeBytes: 120,
      contentSha256: "abc",
      isText: true,
      isBinary: false,
      isGenerated: false,
      isIgnored: false,
      ignoreReason: null,
      isParseable: true,
      parseStatus: "parsed",
      parserName: "codemap-regex-parser",
      parserVersion: "0.1.0",
      lineCount: 2,
      content: [
        "import { useAuth } from '@/hooks/useAuth';",
        "export function Page() {}",
      ].join("\n"),
    },
  });

  assert.equal(semantics.imports.length, 1);
  assert.equal(semantics.imports[0]?.resolutionKind, "tsconfig_alias");
  assert.equal(
    semantics.imports[0]?.targetPathText,
    "packages/web/hooks/useAuth.ts",
  );
  assert.equal(semantics.imports[0]?.targetExternalSymbolKey, null);
  assert.equal(semantics.externalSymbols.length, 0);
});
