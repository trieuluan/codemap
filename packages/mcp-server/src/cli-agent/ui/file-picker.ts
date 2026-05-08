import { select, isCancel, cancel } from "@clack/prompts";

export type FilePickerItem = {
  path: string;
  label?: string;
  hint?: string;
};

export async function pickFile(items: FilePickerItem[]) {
  if (items.length === 0) {
    console.log("No files found.");
    return undefined;
  }

  const selected = await select({
    message: "Select file",
    options: items.slice(0, 50).map((item) => ({
      value: item.path,
      label: item.label ?? item.path,
      hint: item.hint,
    })),
  });

  if (isCancel(selected)) {
    cancel("Cancelled");
    return undefined;
  }

  return selected;
}
