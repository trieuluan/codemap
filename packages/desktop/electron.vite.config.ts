import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import monacoEditorPluginModule from "vite-plugin-monaco-editor";

// vite-plugin-monaco-editor uses CJS exports.default; TS import gets the namespace
const monacoEditorPlugin = (monacoEditorPluginModule as any).default ?? monacoEditorPluginModule;

// Strip missing source map references from monaco-editor minified files
// Monaco ships sourceMappingURL comments pointing to min-maps/ dir that doesn't exist in npm package
function stripMonacoSourcemapRefs(): import("vite").Plugin {
  return {
    name: "strip-monaco-sourcemap",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("monaco-editor") && id.includes("loader.js")) {
        return { code: code.replace(/\/\/# sourceMappingURL=.+$/m, ""), map: null };
      }
    },
  };
}

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
    },
    worker: {
      format: "es",
    },
    plugins: [
      react(),
      tailwindcss(),
      stripMonacoSourcemapRefs(),
      monacoEditorPlugin({
        languageWorkers: ["editorWorkerService", "typescript", "json", "css", "html"],
      }),
    ],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, "src/renderer/index.html"),
      },
    },
  },
});
