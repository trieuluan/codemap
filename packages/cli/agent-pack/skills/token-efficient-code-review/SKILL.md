---
name: codemap-token-efficient-code-review
description: "Use when reviewing a diff or PR — symbol-level review, severity-ranked findings, minimal token usage"
---

# Token-Efficient Code Review

Use this skill when reviewing changes in a CodeMap-indexed repository.

## Process

1. Start with `diff(mode="working")` or `diff(mode="refs")`.
2. For changed symbols, use `symbol` instead of full-file reads.
3. Use `symbol` for risky public API, shared behavior, or call-flow changes.
4. Lead with concrete findings ordered by severity.
5. Mention test gaps and residual risk.

## Rule

Review behavior, integration risks, and missing verification. Avoid summarizing broad context unless it supports a finding.
