import type { CodeMapApi } from "../shared/ipc.js";

declare global {
  interface Window {
    codemap: CodeMapApi;
  }
}

export {};
