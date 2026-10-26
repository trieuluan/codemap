import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

const environment = {
  getWorker(_moduleId: string, label: string) {
    if (label === "typescript" || label === "javascript") return new Worker(new URL("monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url), { type: "module" });
    if (label === "json") return new Worker(new URL("monaco-editor/esm/vs/language/json/json.worker.js", import.meta.url), { type: "module" });
    if (["css", "scss", "less"].includes(label)) return new Worker(new URL("monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url), { type: "module" });
    if (["html", "handlebars", "razor"].includes(label)) return new Worker(new URL("monaco-editor/esm/vs/language/html/html.worker.js", import.meta.url), { type: "module" });
    return new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), { type: "module" });
  },
};
(globalThis as typeof globalThis & { MonacoEnvironment: typeof environment }).MonacoEnvironment = environment;
loader.config({ monaco });
