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
  ],
  esbuildPlugins: [
    {
      name: "external-native-modules",
      setup(build) {
        build.onResolve({ filter: /\.node$/ }, () => ({ external: true }));
      },
    },
  ],
  onSuccess:
    "chmod +x dist/index.js && perl -pi -e 's/from \"sqlite\"/from \"node:sqlite\"/g' dist/*.js",
});
