import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      // Bundle @codemap-ai/* from source (not externalized) for hot-reload during dev
      externalizeDeps: {
        exclude: ["@codemap-ai/core", "@codemap-ai/runtime-node"],
      },
      rollupOptions: {
        external: [
          // Native binaries — must stay external
          /^@duckdb\//,
          /^@libsql\//,
          "utf-8-validate",
          "bufferutil",
          // These packages use dynamic require() for native .node bindings and
          // cannot be bundled by rollup/commonjs. Resolved at runtime via NODE_PATH.
          "mastracode",
          /^@mastra\//,
          /^onnxruntime/,
          "sharp",
          /^@img\//,
        ],
        input: {
          index: resolve(import.meta.dirname, "src/main/index.ts"),
          utility: resolve(import.meta.dirname, "src/utility/index.ts"),
        },
        output: {
          // CJS so require() works for externalized native packages
          format: "cjs",
          entryFileNames: "[name].cjs",
          chunkFileNames: "chunks/[name]-[hash].cjs",
        },
      },
    },
  },
  preload: {
    ssr: {
      noExternal: true,
    },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(import.meta.dirname, "src/preload/index.ts"),
        output: {
          entryFileNames: "index.cjs",
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, "src/renderer"),
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "src/renderer"),
      },
      dedupe: [
        "monaco-editor",
        "@codingame/monaco-vscode-api",
      ],
    },
    worker: {
      format: "es",
    },
    optimizeDeps: {
      exclude: [
        "monaco-editor",
        "@codingame/monaco-vscode-api",
        "@codingame/monaco-vscode-base-service-override",
        "@codingame/monaco-vscode-configuration-service-override",
        "@codingame/monaco-vscode-environment-service-override",
        "@codingame/monaco-vscode-extensions-service-override",
        "@codingame/monaco-vscode-files-service-override",
        "@codingame/monaco-vscode-host-service-override",
        "@codingame/monaco-vscode-keybindings-service-override",
        "@codingame/monaco-vscode-languages-service-override",
        "@codingame/monaco-vscode-layout-service-override",
        "@codingame/monaco-vscode-model-service-override",
        "@codingame/monaco-vscode-quickaccess-service-override",
        "@codingame/monaco-vscode-textmate-service-override",
        "@codingame/monaco-vscode-theme-service-override",
        "@codingame/monaco-vscode-theme-defaults-default-extension",
        "@codingame/monaco-vscode-javascript-default-extension",
        "@codingame/monaco-vscode-json-default-extension",
        "@codingame/monaco-vscode-typescript-basics-default-extension",
        "@codingame/monaco-vscode-markdown-basics-default-extension",
      ],
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, "src/renderer/index.html"),
      },
    },
  },
});
