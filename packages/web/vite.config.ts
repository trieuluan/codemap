import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "src/renderer"),
  publicDir: resolve(import.meta.dirname, "public"),
  resolve: { alias: { "@": resolve(import.meta.dirname, "src/renderer") } },
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  server: { proxy: { "/api": "http://127.0.0.1:4747" } },
  build: { outDir: resolve(import.meta.dirname, "dist"), emptyOutDir: true },
});
