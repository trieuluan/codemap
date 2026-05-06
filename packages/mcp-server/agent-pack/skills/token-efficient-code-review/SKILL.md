# Token-Efficient Code Review

Use this skill when reviewing changes in a CodeMap-indexed repository.

## Process

1. Start with `get_working_diff` or `get_diff`.
2. For changed symbols, use `get_symbol_context` instead of full-file reads.
3. Use `find_usages` or `find_callers` for risky public API, shared behavior, or call-flow changes.
4. Lead with concrete findings ordered by severity.
5. Mention test gaps and residual risk.

## Rule

Review behavior, integration risks, and missing verification. Avoid summarizing broad context unless it supports a finding.
