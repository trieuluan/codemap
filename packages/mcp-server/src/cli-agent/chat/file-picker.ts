import { cancel, isCancel, select } from "@clack/prompts";

export interface FilePickerItem {
  path: string;
  label?: string;
  hint?: string;
}

export async function pickFile(
  items: FilePickerItem[],
): Promise<string | undefined> {
  if (items.length === 0) {
    console.log("No files found.");
    return undefined;
  }

  const options = items.slice(0, 50);
  const selected = await select({
    message: "Select file",
    options: options.map((item) => ({
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
