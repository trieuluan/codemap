import { buildLocalIndex, ensureLocalIndex, readLocalIndex } from "../lib/local-index.js";

export async function runLocalIndexCommand(args: string[]): Promise<void> {
  const force = args.includes("--force");
  const status = args.includes("--status");

  const store = status
    ? (await readLocalIndex()) ?? (await buildLocalIndex())
    : await ensureLocalIndex({ force });
  const summary = store.getSummary();

  console.log(status ? "CodeMap local index status" : "CodeMap local index ready");
  console.log(`Workspace: ${summary.workspaceRootPath}`);
  console.log(`Cache: ${summary.cachePath}`);
  console.log(`Indexed at: ${summary.indexedAt ?? "never"}`);
  console.log(`Files: ${summary.fileCount}`);
  console.log(`Symbols: ${summary.symbolCount}`);
}
