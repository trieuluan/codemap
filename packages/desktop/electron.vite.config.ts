import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: [
          // Native binaries — must be external
          /^@duckdb\//,
          /^@libsql\//,
          "utf-8-validate",
          "bufferutil",
          // Workspace packages
          /^@codemap-ai\//,
          // Mastra runtime — keep as require() for faster startup
          "mastracode",
          /^@mastra\//,
          // AI SDK
          "ai",
          /^@ai-sdk\//,
        ],
        input: {
          index: resolve(import.meta.dirname, "src/main/index.ts"),
          utility: resolve(import.meta.dirname, "src/utility/index.ts"),
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
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, "src/renderer/index.html"),
      },
    },
  },
});
