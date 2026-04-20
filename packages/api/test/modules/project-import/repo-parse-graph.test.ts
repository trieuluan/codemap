import * as assert from "node:assert";
import { test } from "node:test";
import { createRepoParseGraphService } from "../../../src/modules/project-import/repo-parse-graph";

test("repo parse graph service lists files and excludes ignored files by default", async () => {
  let queryCount = 0;

  const database = {
    query: {
      repoFile: {
        findMany: async () => {
          queryCount += 1;

          return [
            {
              id: "file-1",
              projectImportId: "import-1",
              path: "src/index.ts",
              dirPath: "src",
              baseName: "index.ts",
              extension: "ts",
              language: "TypeScript",
              mimeType: "text/plain",
              sizeBytes: 123,
              contentSha256: null,
              isText: true,
              isBinary: false,
              isGenerated: false,
              isIgnored: false,
              ignoreReason: null,
              isParseable: true,
              parseStatus: "parsed",
              parserName: "tree-sitter",
              parserVersion: "1.0.0",
              lineCount: 10,
              extraJson: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        },
      },
    },
  } as unknown as typeof import("../../../src/db").db;

  const service = createRepoParseGraphService(database);
  const files = await service.listFiles("import-1");

  assert.equal(queryCount, 1);
  assert.equal(files.length, 1);
  assert.equal(files[0]?.path, "src/index.ts");
  assert.equal(files[0]?.language, "TypeScript");
});

test("repo parse graph service maps internal and external import edges", async () => {
  const database = {
    query: {
      repoImportEdge: {
        findMany: async () => [
          {
            id: "edge-1",
            projectImportId: "import-1",
            sourceFileId: "file-1",
            targetFileId: "file-2",
            targetPathText: "src/utils.ts",
            targetExternalSymbolKey: null,
            moduleSpecifier: "./utils",
            importKind: "import",
            isTypeOnly: false,
            isResolved: true,
            resolutionKind: "relative_path",
            startLine: 1,
            startCol: 0,
            endLine: 1,
            endCol: 20,
            extraJson: null,
            createdAt: new Date(),
            sourceFile: {
              id: "file-1",
              path: "src/index.ts",
            },
            targetFile: {
              id: "file-2",
              path: "src/utils.ts",
            },
          },
          {
            id: "edge-2",
            projectImportId: "import-1",
            sourceFileId: "file-1",
            targetFileId: null,
            targetPathText: null,
            targetExternalSymbolKey: "npm:react#useState",
            moduleSpecifier: "react",
            importKind: "import",
            isTypeOnly: false,
            isResolved: false,
            resolutionKind: "package",
            startLine: 2,
            startCol: 0,
            endLine: 2,
            endCol: 30,
            extraJson: null,
            createdAt: new Date(),
            sourceFile: {
              id: "file-1",
              path: "src/index.ts",
            },
            targetFile: null,
          },
        ],
      },
    },
  } as unknown as typeof import("../../../src/db").db;

  const service = createRepoParseGraphService(database);
  const internalEdges = await service.listImportEdges("import-1");
  const allEdges = await service.listImportEdges("import-1", {
    includeExternal: true,
  });

  assert.equal(internalEdges.length, 1);
  assert.equal(internalEdges[0]?.targetFilePath, "src/utils.ts");
  assert.equal(allEdges.length, 2);
  assert.equal(allEdges[1]?.targetExternalSymbolKey, "npm:react#useState");
});

test("repo parse graph service maps symbols, exports, and relationships", async () => {
  const database = {
    query: {
      repoSymbol: {
        findMany: async () => [
          {
            id: "symbol-1",
            projectImportId: "import-1",
            fileId: "file-1",
            stableSymbolKey: "scip:example",
            localSymbolKey: null,
            displayName: "ExampleService",
            kind: "class",
            language: "TypeScript",
            visibility: "public",
            isExported: true,
            isDefaultExport: false,
            signature: "class ExampleService",
            returnType: null,
            parentSymbolId: null,
            ownerSymbolKey: null,
            docJson: null,
            typeJson: null,
            modifiersJson: null,
            extraJson: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            file: {
              id: "file-1",
              path: "src/service.ts",
            },
            parentSymbol: null,
          },
        ],
      },
      repoExport: {
        findMany: async () => [
          {
            id: "export-1",
            projectImportId: "import-1",
            fileId: "file-1",
            symbolId: "symbol-1",
            exportName: "ExampleService",
            exportKind: "named",
            sourceImportEdgeId: null,
            targetExternalSymbolKey: null,
            startLine: 1,
            startCol: 0,
            endLine: 1,
            endCol: 20,
            extraJson: null,
            createdAt: new Date(),
            file: {
              id: "file-1",
              path: "src/service.ts",
            },
            symbol: {
              id: "symbol-1",
              displayName: "ExampleService",
            },
            sourceImportEdge: null,
          },
        ],
      },
      repoSymbolRelationship: {
        findMany: async () => [
          {
            id: "relationship-1",
            projectImportId: "import-1",
            fromSymbolId: "symbol-1",
            toSymbolId: "symbol-2",
            toExternalSymbolKey: null,
            relationshipKind: "implements",
            isReference: false,
            isImplementation: true,
            isTypeDefinition: false,
            isDefinition: false,
            extraJson: null,
            createdAt: new Date(),
            fromSymbol: {
              id: "symbol-1",
              displayName: "ExampleService",
            },
            toSymbol: {
              id: "symbol-2",
              displayName: "ServiceContract",
            },
          },
        ],
      },
    },
  } as unknown as typeof import("../../../src/db").db;

  const service = createRepoParseGraphService(database);
  const symbols = await service.listSymbols("import-1", { kind: "class" });
  const exportsForFile = await service.listExports("import-1", "file-1");
  const relationships = await service.listRelationshipsForSymbol(
    "import-1",
    "symbol-1",
    {
      onlyImplementations: true,
    },
  );

  assert.equal(symbols.length, 1);
  assert.equal(symbols[0]?.filePath, "src/service.ts");
  assert.equal(exportsForFile.length, 1);
  assert.equal(exportsForFile[0]?.symbolDisplayName, "ExampleService");
  assert.equal(relationships.length, 1);
  assert.equal(relationships[0]?.toSymbolName, "ServiceContract");
  assert.equal(relationships[0]?.isImplementation, true);
});

test("repo parse graph service compares two imports by path and symbol key", async () => {
  const database = {
    query: {
      repoFile: {
        findMany: async (input: { where: { right: { value: string } } }) => {
          if (input.where.right.value === "import-prev") {
            return [
              {
                id: "file-prev-1",
                projectImportId: "import-prev",
                path: "src/old.ts",
                dirPath: "src",
                baseName: "old.ts",
                extension: "ts",
                language: "TypeScript",
                mimeType: "text/plain",
                sizeBytes: 100,
                contentSha256: "aaa",
                isText: true,
                isBinary: false,
                isGenerated: false,
                isIgnored: false,
                ignoreReason: null,
                isParseable: true,
                parseStatus: "parsed",
                parserName: "tree-sitter",
                parserVersion: "1.0.0",
                lineCount: 5,
                extraJson: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: "file-prev-2",
                projectImportId: "import-prev",
                path: "src/shared.ts",
                dirPath: "src",
                baseName: "shared.ts",
                extension: "ts",
                language: "TypeScript",
                mimeType: "text/plain",
                sizeBytes: 100,
                contentSha256: "bbb",
                isText: true,
                isBinary: false,
                isGenerated: false,
                isIgnored: false,
                ignoreReason: null,
                isParseable: true,
                parseStatus: "parsed",
                parserName: "tree-sitter",
                parserVersion: "1.0.0",
                lineCount: 5,
                extraJson: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ];
          }

          return [
            {
              id: "file-cur-1",
              projectImportId: "import-cur",
              path: "src/new.ts",
              dirPath: "src",
              baseName: "new.ts",
              extension: "ts",
              language: "TypeScript",
              mimeType: "text/plain",
              sizeBytes: 100,
              contentSha256: "ccc",
              isText: true,
              isBinary: false,
              isGenerated: false,
              isIgnored: false,
              ignoreReason: null,
              isParseable: true,
              parseStatus: "parsed",
              parserName: "tree-sitter",
              parserVersion: "1.0.0",
              lineCount: 5,
              extraJson: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: "file-cur-2",
              projectImportId: "import-cur",
              path: "src/shared.ts",
              dirPath: "src",
              baseName: "shared.ts",
              extension: "ts",
              language: "TypeScript",
              mimeType: "text/plain",
              sizeBytes: 101,
              contentSha256: "changed",
              isText: true,
              isBinary: false,
              isGenerated: false,
              isIgnored: false,
              ignoreReason: null,
              isParseable: true,
              parseStatus: "parsed",
              parserName: "tree-sitter",
              parserVersion: "1.0.0",
              lineCount: 5,
              extraJson: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
        },
      },
      repoSymbol: {
        findMany: async (input: { where: { right: { value: string } } }) => {
          if (input.where.right.value === "import-prev") {
            return [
              {
                stableSymbolKey: "symbol:old",
                localSymbolKey: null,
              },
            ];
          }

          return [
            {
              stableSymbolKey: "symbol:new",
              localSymbolKey: null,
            },
          ];
        },
      },
    },
  } as unknown as typeof import("../../../src/db").db;

  const service = createRepoParseGraphService(database);
  const diff = await service.compareImports("import-prev", "import-cur");

  assert.equal(diff.addedFiles.length, 1);
  assert.equal(diff.addedFiles[0]?.path, "src/new.ts");
  assert.equal(diff.removedFiles.length, 1);
  assert.equal(diff.removedFiles[0]?.path, "src/old.ts");
  assert.equal(diff.changedFiles.length, 1);
  assert.equal(diff.changedFiles[0]?.current.path, "src/shared.ts");
  assert.deepStrictEqual(diff.addedSymbolKeys, ["symbol:new"]);
  assert.deepStrictEqual(diff.removedSymbolKeys, ["symbol:old"]);
});
