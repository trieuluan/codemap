import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkspaceFileSemantics } from "./index.js";
import type { WorkspaceFileCandidate } from "../file-discovery.js";

function makeFile(path: string, language: string, content: string): WorkspaceFileCandidate {
  const parts = path.split("/");
  const baseName = parts[parts.length - 1] ?? path;
  const dirPath = parts.slice(0, -1).join("/");
  return {
    path,
    absolutePath: `/repo/${path}`,
    dirPath,
    baseName,
    extension: baseName.includes(".") ? baseName.split(".").pop() ?? null : null,
    language,
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(content, "utf8"),
    contentSha256: "test",
    isText: true,
    isBinary: false,
    isGenerated: false,
    lineCount: content.split("\n").length,
    content,
  } as WorkspaceFileCandidate;
}

test("parseRustFile extracts structs, traits, impl methods, mods, uses, and calls", async () => {
  const filePathSet = new Set(["src/lib.rs", "src/foo.rs", "src/bar/mod.rs"]);
  const file = makeFile(
    "src/lib.rs",
    "Rust",
    `
mod foo;
use crate::bar::Baz;
use std::collections::HashMap;

pub struct MyStruct {
    x: i32,
}

pub trait MyTrait {
    fn do_it(&self);
}

impl MyTrait for MyStruct {
    fn do_it(&self) {
        helper();
    }
}

fn helper() {}
`,
  );

  const res = await parseWorkspaceFileSemantics({
    file,
    filePathSet,
    projectImportId: "local",
    workspacePath: "/repo",
  });

  const names = res.symbols.map((s) => `${s.kind}:${s.displayName}`);
  assert.ok(names.includes("class:MyStruct"));
  assert.ok(names.includes("trait:MyTrait"));
  assert.ok(names.includes("method:do_it"));
  assert.ok(names.includes("function:helper"));
  assert.ok(res.imports.some((i) => i.targetPathText === "src/foo.rs"));
  assert.ok(res.imports.some((i) => i.targetPathText === "src/bar/mod.rs"));
  assert.ok(res.relationships.some((r) => r.relationshipKind === "implements" && r.toSymbolName === "MyTrait"));
  assert.ok(res.calls.some((c) => c.calleeName === "helper"));
});

test("parseGoFile extracts structs, interfaces, functions, methods, imports, and calls", async () => {
  const file = makeFile(
    "main.go",
    "Go",
    `
package main
import "fmt"
type Server struct { Port int }
type Handler interface { Handle() }
func (s *Server) Handle() { fmt.Println("ok") }
func main() { helper() }
`,
  );
  const res = await parseWorkspaceFileSemantics({
    file,
    filePathSet: new Set(["main.go"]),
    projectImportId: "local",
    workspacePath: "/repo",
  });
  const names = res.symbols.map((s) => `${s.kind}:${s.displayName}`);
  assert.ok(names.includes("class:Server"));
  assert.ok(names.includes("interface:Handler"));
  assert.ok(names.includes("method:Handle"));
  assert.ok(names.includes("function:main"));
  assert.ok(res.imports.some((i) => i.moduleSpecifier === "fmt"));
  assert.ok(res.calls.some((c) => c.calleeName === "Println"));
});

test("parseCCppFile extracts C/C++ structs, classes, functions, local includes, and calls", async () => {
  const filePathSet = new Set(["src/main.cpp", "src/local.hpp"]);
  const file = makeFile(
    "src/main.cpp",
    "C++",
    `
#include "local.hpp"
#include <vector>
namespace app {
  class Engine {
  public:
    void run() { step(); }
  };
}
int main() { return 0; }
`,
  );
  const res = await parseWorkspaceFileSemantics({
    file,
    filePathSet,
    projectImportId: "local",
    workspacePath: "/repo",
  });
  const names = res.symbols.map((s) => `${s.kind}:${s.displayName}`);
  assert.ok(names.includes("namespace:app"));
  assert.ok(names.includes("class:Engine"));
  assert.ok(names.includes("method:run"));
  assert.ok(names.includes("function:main"));
  assert.ok(res.imports.some((i) => i.targetPathText === "src/local.hpp"));
  assert.ok(res.calls.some((c) => c.calleeName === "step"));
});

test("parseCSharpFile, parseRubyFile, parseSwiftFile, and extra langs extract symbols", async () => {
  const cases: Array<[string, string, string, string]> = [
    ["Program.cs", "C#", "using System; namespace App { public class Runner { public void Run() { Go(); } } }", "Runner"],
    ["app.rb", "Ruby", "require_relative './lib'\nmodule Web\n  class App\n    def start; boot(); end\n  end\nend", "App"],
    ["App.swift", "Swift", "import Foundation\nprotocol Runnable { func run() }\nclass App: Runnable { func run() { boot() } }", "App"],
    ["Main.scala", "Scala", "import scala.util._\nclass Service { def run(): Unit = work() }", "Service"],
    ["app.ex", "Elixir", "defmodule MyApp do\n  alias MyApp.Repo\n  def start(x), do: boot(x)\nend", "MyApp"],
    ["init.lua", "Lua", "local m = require('mod')\nfunction start() return boot() end", "start"],
    ["main.zig", "Zig", "const std = @import(\"std\");\npub const Config = struct {};\npub fn main() void { boot(); }", "Config"],
  ];

  for (const [filePath, lang, code, expectedSymbol] of cases) {
    const res = await parseWorkspaceFileSemantics({
      file: makeFile(filePath, lang, code),
      filePathSet: new Set([filePath, "lib.rb"]),
      projectImportId: "local",
      workspacePath: "/repo",
    });
    assert.ok(
      res.symbols.some((s) => s.displayName === expectedSymbol),
      `Expected symbol ${expectedSymbol} in ${lang}, got ${JSON.stringify(res.symbols.map((s) => s.displayName))}`,
    );
  }
});
