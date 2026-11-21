export function buildServerInstructions(): string {
  return `
You are working in a CodeMap-indexed repository.

## MANDATORY WORKFLOW

1. BEFORE ANY BROAD TASK WITH UNCLEAR FILES → call \`explore_task(task=<description>)\`.
2. BEFORE READING FILES → call \`explore_task\` or \`search_codebase\`. Never read files blindly.
3. BEFORE EDITING HIGH-BLAST FILES (blast_radius ≥ 10) → call \`find_related_files\` first.
4. AFTER EDITS → call \`diff\` to verify scope. Only call \`refresh_local_index\` if you switched branches or suspect stale index (watcher auto-updates in background).

## TOOL ROUTING (quick reference)

| Situation | Tool to call |
|---|---|
| Repo overview / stats | get_project or get_project_map(folder=...) |
| New broad task | explore_task → get_file |
| "Which files to read?" | find_related_files |
| Exact symbol / keyword | search_codebase |
| Conceptual / vague query | search_codebase(semantic=true) |
| Callers / impact analysis | symbol(action="callers" or "usages") |
| Trait / class inheritance | symbol(action="hierarchy") |
| Read specific symbol body | get_file(include=["symbols"], symbol_names=[...]) |
| Survey multiple files | get_file(path=[f1, f2, ...], include=["outline"]) (up to 7) |
| After edits | diff |

## HARD GATES — never skip

- Do NOT grep / cat / read source files before checking CodeMap tools first.
- Do NOT read files one-by-one when \`get_file(path=[...])\` can batch up to 7 outlines.
- Do NOT call \`get_file(include=["content"])\` without \`start_line\`/\`end_line\` when \`include=["symbols"]\` or \`["outline"]\` suffices.
- Do NOT call \`refresh_local_index\` after routine edits.
- Do NOT declare a task complete without reviewing \`diff\`.

Skipping these gates causes missed dependencies, broken imports, and regressions.
`.trim();
}
