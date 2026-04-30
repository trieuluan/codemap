import * as assert from "node:assert";
import { test } from "node:test";
import {
  buildEditLocationSuggestions,
} from "../../../src/modules/project/parse/graph/edit-locations";
import type {
  ProjectMapSearchExportResult,
  ProjectMapSearchFileResult,
  ProjectMapSearchResponse,
  ProjectMapSearchSymbolResult,
} from "../../../src/modules/project/parse/types/repo-parse-graph.types";

type FixtureFile = {
  id: string;
  path: string;
  language: string | null;
  lineCount: number | null;
};

function file(id: string, path: string): FixtureFile {
  return { id, path, language: "TypeScript", lineCount: 240 };
}

function fileResult(path: string): ProjectMapSearchFileResult {
  return { kind: "file", path, language: "TypeScript" };
}

function symbol(
  id: string,
  displayName: string,
  filePath: string,
  kind: ProjectMapSearchSymbolResult["symbolKind"] = "function",
): ProjectMapSearchSymbolResult {
  return {
    kind: "symbol",
    id,
    displayName,
    symbolKind: kind,
    signature: null,
    filePath,
    parentSymbolName: null,
    startLine: 10,
    startCol: 1,
    endLine: 20,
    endCol: 1,
  };
}

function exportResult(
  id: string,
  exportName: string,
  filePath: string,
  symbolId = id,
): ProjectMapSearchExportResult {
  return {
    kind: "export",
    id,
    exportName,
    filePath,
    symbolId,
    symbolStartLine: 10,
    symbolStartCol: 1,
    symbolEndLine: 20,
    symbolEndCol: 1,
    startLine: 10,
    startCol: 1,
    endLine: 20,
    endCol: 1,
  };
}

function suggestions(input: {
  query: string;
  files: FixtureFile[];
  searchResults: ProjectMapSearchResponse;
  limit?: number;
}) {
  return buildEditLocationSuggestions({
    query: input.query,
    searchResults: input.searchResults,
    fileRecords: input.files,
    graphEdges: [],
    limit: input.limit ?? 10,
  });
}

function topPaths(items: Array<{ path: string }>, count: number) {
  return items.slice(0, count).map((item) => item.path);
}

function assertTopIncludes(
  items: Array<{ path: string }>,
  count: number,
  expectedPaths: string[],
) {
  const top = new Set(topPaths(items, count));
  for (const expectedPath of expectedPaths) {
    assert.ok(
      top.has(expectedPath),
      `Expected ${expectedPath} in top ${count}; got ${Array.from(top).join(", ")}`,
    );
  }
}

test("edit location ranking keeps MCP authorize GitHub core files in the top results", () => {
  const files = [
    file("f1", "packages/web/app/mcp/authorize/page.tsx"),
    file("f2", "packages/web/app/mcp/authorize/authorize-button.tsx"),
    file("f3", "packages/web/app/mcp/authorize/github-connect-button.tsx"),
    file("f4", "packages/api/src/modules/github/controller.ts"),
    file("f5", "packages/api/src/modules/github/service.ts"),
    file("f6", "packages/api/src/modules/project/import/source/github-source.ts"),
    file("f7", "packages/mcp-server/src/tools/list-github-repositories.ts"),
  ];

  const ranked = suggestions({
    query: "add optional github setup to MCP authorize flow",
    files,
    searchResults: {
      files: [
        fileResult(files[0]!.path),
        fileResult(files[1]!.path),
        fileResult(files[2]!.path),
        fileResult(files[3]!.path),
        fileResult(files[4]!.path),
        fileResult(files[5]!.path),
        fileResult(files[6]!.path),
      ],
      symbols: [
        symbol("s1", "AuthorizePageProps", files[0]!.path, "interface"),
        symbol("s2", "AuthorizeButton", files[1]!.path, "component"),
        symbol("s3", "GithubConnectButton", files[2]!.path, "component"),
        symbol("s4", "createGithubController", files[3]!.path),
        symbol("s5", "createGithubService", files[4]!.path),
        symbol("s6", "buildGithubCloneUrl", files[5]!.path),
      ],
      exports: [
        exportResult("e1", "AuthorizeButton", files[1]!.path, "s2"),
        exportResult("e2", "GithubConnectButton", files[2]!.path, "s3"),
      ],
    },
    limit: 7,
  });

  assertTopIncludes(ranked, 5, [
    files[0]!.path,
    files[1]!.path,
    files[2]!.path,
    files[3]!.path,
    files[4]!.path,
  ]);

  const importSourceIndex = ranked.findIndex((item) => item.path === files[5]!.path);
  const coreIndexes = [files[0]!.path, files[1]!.path, files[2]!.path, files[3]!.path, files[4]!.path]
    .map((path) => ranked.findIndex((item) => item.path === path));
  assert.ok(coreIndexes.every((index) => index >= 0 && index < importSourceIndex));

  const toolFamily = ranked.find((item) => item.path === files[6]!.path);
  assert.equal(toolFamily?.confidence, "medium");
});

test("edit location ranking finds its own backend and MCP implementation files", () => {
  const files = [
    file("f1", "packages/api/src/modules/project/parse/graph/edit-locations.ts"),
    file("f2", "packages/mcp-server/src/tools/suggest-edit-locations.ts"),
    file("f3", "packages/mcp-server/src/lib/api-types.ts"),
    file("f4", "packages/api/src/modules/project/schema.ts"),
    file("f5", "packages/api/src/modules/project/parse/types/repo-parse-graph.types.ts"),
    file("f6", "packages/mcp-server/src/tools/check-auth-status.ts"),
  ];

  const ranked = suggestions({
    query: "implement deterministic suggest edit locations MCP tool",
    files,
    searchResults: {
      files: [fileResult(files[0]!.path), fileResult(files[1]!.path), fileResult(files[5]!.path)],
      symbols: [
        symbol("s1", "createEditLocationsService", files[0]!.path),
        symbol("s2", "registerSuggestEditLocationsTool", files[1]!.path),
        symbol("s3", "EditLocationSuggestion", files[2]!.path, "interface"),
        symbol("s4", "projectEditLocationsQuerySchema", files[3]!.path, "variable"),
        symbol("s5", "ProjectEditLocationSuggestion", files[4]!.path, "interface"),
      ],
      exports: [
        exportResult("e1", "createEditLocationsService", files[0]!.path, "s1"),
        exportResult("e2", "registerSuggestEditLocationsTool", files[1]!.path, "s2"),
        exportResult("e3", "EditLocationsResponse", files[2]!.path, "s3"),
      ],
    },
  });

  assertTopIncludes(ranked, 5, [
    files[0]!.path,
    files[1]!.path,
    files[2]!.path,
    files[3]!.path,
    files[4]!.path,
  ]);
});

test("edit location ranking surfaces file preview logic before generic project files", () => {
  const files = [
    file("f1", "packages/api/src/modules/project/map/file-preview.ts"),
    file("f2", "packages/api/src/modules/project/controller.ts"),
    file("f3", "packages/api/src/modules/project/schema.ts"),
    file("f4", "packages/api/src/modules/project/service.ts"),
  ];

  const ranked = suggestions({
    query: "fix file preview too large error",
    files,
    searchResults: {
      files: files.map((item) => fileResult(item.path)),
      symbols: [
        symbol("s1", "getProjectFilePreview", files[0]!.path),
        symbol("s2", "buildUnavailableFilePreview", files[0]!.path),
      ],
      exports: [exportResult("e1", "getProjectFilePreview", files[0]!.path, "s1")],
    },
  });

  assert.equal(ranked[0]?.path, files[0]!.path);
});

test("edit location ranking surfaces MCP auth API files before GitHub or generic MCP tools", () => {
  const files = [
    file("f1", "packages/api/src/modules/mcp/service.ts"),
    file("f2", "packages/api/src/modules/mcp/controller.ts"),
    file("f3", "packages/api/src/modules/mcp/schema.ts"),
    file("f4", "packages/mcp-server/src/tools/start-auth-flow.ts"),
    file("f5", "packages/api/src/modules/github/service.ts"),
  ];

  const ranked = suggestions({
    query: "change MCP auth status response",
    files,
    searchResults: {
      files: files.map((item) => fileResult(item.path)),
      symbols: [
        symbol("s1", "createMcpService", files[0]!.path),
        symbol("s2", "getAuthStatus", files[1]!.path),
        symbol("s3", "mcpAuthSessionQuerySchema", files[2]!.path, "variable"),
        symbol("s4", "startMcpLogin", files[3]!.path),
        symbol("s5", "createGithubService", files[4]!.path),
      ],
      exports: [exportResult("e1", "createMcpService", files[0]!.path, "s1")],
    },
  });

  assertTopIncludes(ranked, 3, [files[0]!.path, files[1]!.path, files[2]!.path]);
  assert.ok(
    ranked.findIndex((item) => item.path === files[4]!.path) >
      ranked.findIndex((item) => item.path === files[2]!.path),
  );
});

test("edit location ranking respects limit and keeps broad path-only tool matches below high confidence", () => {
  const files = [
    file("f1", "packages/mcp-server/src/tools/get-github-connect-url.ts"),
    file("f2", "packages/mcp-server/src/tools/list-github-repositories.ts"),
    file("f3", "packages/mcp-server/src/tools/disconnect-github.ts"),
  ];

  const ranked = suggestions({
    query: "github setup",
    files,
    searchResults: {
      files: files.map((item) => fileResult(item.path)),
      symbols: [],
      exports: [],
    },
    limit: 2,
  });

  assert.equal(ranked.length, 2);
  assert.ok(ranked.every((item) => item.confidence !== "high"));
});

test("edit location ranking demotes generic UI symbols for broad roadmap prompts", () => {
  const files = [
    file("f1", "packages/mcp-server/src/lib/import-health.ts"),
    file("f2", "packages/mcp-server/src/resources/project-context.ts"),
    file("f3", "packages/api/src/modules/project/parse/graph/edit-locations.ts"),
    file("f4", "packages/web/components/ui/context-menu.tsx"),
    file("f5", "packages/web/components/ui/button.tsx"),
  ];

  const ranked = suggestions({
    query: "improve CodeMap MCP app next roadmap auth github onboarding search usages project context eval fixtures",
    files,
    searchResults: {
      files: [fileResult(files[0]!.path), fileResult(files[1]!.path), fileResult(files[2]!.path)],
      symbols: [
        symbol("s1", "buildImportHealth", files[0]!.path),
        symbol("s2", "registerProjectContextResource", files[1]!.path),
        symbol("s3", "buildEditLocationSuggestions", files[2]!.path),
        symbol("s4", "ContextMenu", files[3]!.path, "component"),
        symbol("s5", "Button", files[4]!.path, "component"),
      ],
      exports: [
        exportResult("e1", "buildImportHealth", files[0]!.path, "s1"),
        exportResult("e2", "buildEditLocationSuggestions", files[2]!.path, "s3"),
      ],
    },
  });

  assertTopIncludes(ranked, 3, [files[0]!.path, files[1]!.path, files[2]!.path]);

  const genericItems = ranked.filter((item) =>
    [files[3]!.path, files[4]!.path].includes(item.path),
  );
  assert.ok(genericItems.every((item) => item.confidence !== "high"));
  assert.ok(
    genericItems.every((item) =>
      item.signals.some((signal) => signal === "demoted:generic_symbol"),
    ),
  );
});

test("edit location ranking prioritizes concrete domain service over relationship schema matches", () => {
  const files = [
    file("f1", "packages/api/src/modules/project/parse/graph/symbol-graph.ts"),
    file("f2", "packages/api/src/db/relations.ts"),
    file("f3", "packages/api/src/db/schema/repo-parse-schema.ts"),
    file("f4", "packages/api/src/modules/project/parse/graph/symbol-usages.ts"),
  ];

  const ranked = suggestions({
    query: "optimize symbol graph service to avoid duplicate relationship queries in backend endpoint",
    files,
    searchResults: {
      files: files.map((item) => fileResult(item.path)),
      symbols: [
        symbol("s1", "createSymbolGraphService", files[0]!.path),
        symbol("s2", "repoSymbolRelationshipRelations", files[1]!.path, "variable"),
        symbol("s3", "repoSymbolRelationship", files[2]!.path, "variable"),
        symbol("s4", "createSymbolUsagesService", files[3]!.path),
      ],
      exports: [
        exportResult("e1", "createSymbolGraphService", files[0]!.path, "s1"),
        exportResult("e2", "repoSymbolRelationshipRelations", files[1]!.path, "s2"),
      ],
    },
  });

  assert.equal(ranked[0]?.path, files[0]!.path);
  assert.ok(
    ranked.findIndex((item) => item.path === files[0]!.path) <
      ranked.findIndex((item) => item.path === files[1]!.path),
  );
});
