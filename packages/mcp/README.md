# @codemap-ai/mcp

Standalone CodeMap MCP server for editor and agent integrations such as Claude Code, Cursor, Codex, Gemini, OpenCode, and GitHub Copilot.

## Install

```bash
npm install -g @codemap-ai/mcp
```

This package installs the `codemap-mcp` binary.

## Usage

Add CodeMap to your MCP client config:

```json
{
  "mcpServers": {
    "codemap": {
      "command": "npx",
      "args": ["-y", "@codemap-ai/mcp"]
    }
  }
}
```

Then authenticate with the CodeMap CLI:

```bash
codemap login
```

If you want the full interactive terminal agent plus editor integration helpers, install `@codemap-ai/cli` instead.

## Links

- [codemap.codes](https://codemap.codes)
- [Documentation](https://codemap.codes/docs)
