# @codemap-ai/mcp

CodeMap MCP server for IDE integrations (Claude, Cursor, Codex, Copilot, Gemini, OpenCode).

## Usage

Add to your MCP client config:

```json
{
  "mcpServers": {
    "codemap": {
      "command": "npx",
      "args": ["-y", "@codemap-ai/mcp"],
      "env": {
        "CODEMAP_API_TOKEN": "<your-token>"
      }
    }
  }
}
```

## Links

- [codemap.codes](https://codemap.codes)
- [Documentation](https://codemap.codes/docs)
