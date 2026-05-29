import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: "esm",
  target: "node22",
  platform: "node",
  bundle: true,
  sourcemap: false,
  clean: true,
  // Polyfill CJS globals for ESM bundles (needed because code-index bundles typescript which uses __filename/__dirname/require)
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
  // Bundle local workspace packages but keep heavy native/WASM deps external
  noExternal: [/@codemap\//],
  external: [
    "web-tree-sitter",
    "tree-sitter-wasms",
    "tree-sitter-python",
    "better-sqlite3",
  ],
  // esbuild strips "node:" prefix from "node:sqlite" when bundling.
  // sed patches it back so the runtime import resolves correctly.
  onSuccess:
    "chmod +x dist/index.js && sed -i '' 's/from \"sqlite\"/from \"node:sqlite\"/g' dist/*.js",
});
