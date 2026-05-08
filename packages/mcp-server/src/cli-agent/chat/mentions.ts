import { cancel, isCancel, text } from "@clack/prompts";

import { pickFile } from "./file-picker.js";
import { searchIndexedFiles } from "./file-search.js";

export async function resolveMention(): Promise<string | undefined> {
  const query = await text({
    message: "Search file",
    placeholder: "auth, login-form, packages/api/...",
  });

  if (isCancel(query)) {
    cancel("Cancelled");
    return undefined;
  }

  const files = await searchIndexedFiles(query);
  const selected = await pickFile(files);
  return selected;
}
