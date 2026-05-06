# Symbol-Level Debugging

Use this skill when a bug or behavior centers on a specific function, class, component, method, or export.

## Process

1. Call `search_codebase` with the symbol name if the file is unknown.
2. Call `get_symbol_context(symbol_name, file_path?)` for the exact body.
3. Call `find_callers` or `find_usages` when impact or call flow matters.
4. Read only the adjacent files needed to explain or change behavior.
5. After editing, run targeted verification and inspect the diff.

## Rule

Do not read an entire large file just to inspect one symbol when CodeMap can return symbol context.
