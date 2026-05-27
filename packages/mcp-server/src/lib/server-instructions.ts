export function buildServerInstructions(): string {
  return `
You are working in a CodeMap-indexed repository.

## MANDATORY WORKFLOW

1. START OF EVERY SESSION → call \`get_agent_workflow\` to load rules and tool routing.
2. BEFORE ANY BROAD TASK WITH UNCLEAR FILES → call \`explore_task(task=<description>)\`.
3. BEFORE READING FILES → call \`explore_task\` or \`search_codebase\`. Never read files blindly.
4. BEFORE EDITING HIGH-BLAST FILES (blast_radius ≥ 10) → call \`find_related_files\` first.
5. AFTER EDITS → call \`diff\` to verify scope, then \`reimport(wait=true)\` if index changed.

## TOOL ROUTING (quick reference)

| Situation | Tool to call |
|---|---|
| New broad task | explore_task → get_file → get_file |
| "Which files to read?" | find_related_files |
| Symbol / keyword lookup | search_codebase or symbol |
| Impact analysis | symbol / symbol |
| Read specific symbol body | get_file(include=["symbols"], symbol_names=[...]) |
| Survey file structure | get_file(include=["outline"]) |
| After edits | diff → reimport(wait=true) |

## HARD GATES — never skip

- Do NOT grep / cat / read source files before checking CodeMap tools first.
- Do NOT edit a file with blast_radius ≥ 10 without calling find_related_files first.
- Do NOT declare a task complete without reviewing diff.
- Do NOT call get_file(include=["content"]) when include=["symbols"] or include=["outline"] would suffice.

Skipping these gates causes missed dependencies, broken imports, and regressions.
`.trim();
}
