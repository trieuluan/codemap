import * as assert from "node:assert";
import { test } from "node:test";
import { parseWorkspaceFileSemantics } from "../../../src/modules/project-import/parse-runner";

test("parseWorkspaceFileSemantics extracts basic TypeScript imports, symbols, and exports", () => {
  const semantics = parseWorkspaceFileSemantics({
    projectImportId: "import-1",
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

test("parseWorkspaceFileSemantics extracts Dart imports and declarations", () => {
  const semantics = parseWorkspaceFileSemantics({
    projectImportId: "import-1",
    filePathSet: new Set(["lib/src/models.dart"]),
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
      lineCount: 3,
      content: [
        "import 'src/models.dart';",
        "class App {}",
        "mixin Loadable {}",
      ].join("\n"),
    },
  });

  assert.equal(semantics.imports.length, 1);
  assert.equal(semantics.imports[0]?.importKind, "import");
  assert.equal(semantics.imports[0]?.targetPathText, "lib/src/models.dart");
  assert.equal(semantics.symbols.length, 2);
  assert.equal(semantics.symbols[0]?.displayName, "App");
  assert.equal(semantics.symbols[1]?.kind, "mixin");
});

test("parseWorkspaceFileSemantics extracts PHP namespaces, use statements, and symbols", () => {
  const semantics = parseWorkspaceFileSemantics({
    projectImportId: "import-1",
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
