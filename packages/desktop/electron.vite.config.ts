import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    ssr: {
      noExternal: true,
    },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: [/^@duckdb\//],
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
