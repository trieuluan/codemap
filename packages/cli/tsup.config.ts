import { defineConfig } from "tsup";
import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

export default defineConfig({
  entry: { index: "src/index.ts", "web-worker": "src/web/worker.ts" },
  outDir: "dist",
  format: "esm",
  target: "node22",
  platform: "node",
  bundle: true,
  sourcemap: false,
  clean: true,
  banner: {
    js: [
      `import{createRequire as __cmr}from"node:module";`,
      `import{fileURLToPath as __f2p}from"node:url";`,
      `import{dirname as __dn}from"node:path";`,
      `var require=__cmr(import.meta.url);`,
      `var __filename=__f2p(import.meta.url);`,
      `var __dirname=__dn(__filename);`,
    ].join(""),
  },
  noExternal: [/@codemap-ai\//],
  external: [
    "web-tree-sitter",
    "tree-sitter-wasms",
    "tree-sitter-python",
    "better-sqlite3",
    "@parcel/watcher",
    // Transitive deps of @codemap-ai/runtime-node — keep as require()
    "mastracode",
    /^@mastra\//,
    "ai",
    /^@ai-sdk\//,
    "@modelcontextprotocol/sdk",
  ],
  async onSuccess() {
    execFileSync("chmod", ["+x", "dist/index.js"]);
    for (const file of await readdir("dist")) {
      if (!file.endsWith(".js")) continue;
      const path = `dist/${file}`;
      const source = await readFile(path, "utf8");
      await writeFile(path, source.replaceAll('from "sqlite"', 'from "node:sqlite"'));
    }
    await cp("../web/dist", "dist/web", { recursive: true });
  },
});
