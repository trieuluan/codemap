# Ponytail Edit Gate

Before ANY file edit (string_replace_lsp, write_file, delete_file, ast_smart_edit):

1. Activate the `codemap-ponytail` skill
2. Walk the 6-step decision ladder:
   - **Delete** — can removing code achieve the goal?
   - **Reuse** — does existing code, stdlib, or a dependency already solve this?
   - **Configure** — can env vars, settings, or config handle it?
   - **Inline** — can it be 5 lines or fewer? Inline it.
   - **Abstract** — do 3+ call sites need it with real variation?
   - **Write** — only if nothing above works, write the minimal implementation.
3. Show your ladder reasoning in thinking before touching any file.

No exceptions. Even one-line changes must pass the ladder first.
