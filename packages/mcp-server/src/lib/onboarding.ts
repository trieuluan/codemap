type OnboardingTarget = "claude" | "cursor" | "codex" | "gemini" | "opencode" | "copilot";

const DIVIDER = "─".repeat(50);

const MCP_JSON_SNIPPET = (key: string) =>
  [
    `  {`,
    `    "${key}": {`,
    `      "codemap-mcp": {`,
    `        "command": "npx",`,
    `        "args": ["-y", "@codemap/mcp-server"]`,
    `      }`,
    `    }`,
    `  }`,
  ].join("\n");

const COMMON_STEPS_AFTER_SERVER = [
  "",
  "2. Authenticate",
  "   $ codemap-mcp login",
  "",
  "3. Verify (inside the editor / agent)",
  "   Call: ping  →  expect reply \"pong\"",
  "",
  "4. Link this project",
  "   Call: link_project",
  "         (or create_project if no CodeMap project exists yet)",
  "",
  "5. Build local index",
  "   $ codemap-mcp local-index",
].join("\n");

const FOOTER = [
  "",
  DIVIDER,
  "  Done! For every broad task, start with:",
  "  recommend_agent_workflow(task=<description>)",
  DIVIDER,
].join("\n");

function guide(title: string, step1Lines: string[]): string {
  return [
    DIVIDER,
    `  CodeMap MCP — ${title} Setup`,
    DIVIDER,
    "",
    ...step1Lines,
    COMMON_STEPS_AFTER_SERVER,
    FOOTER,
  ].join("\n");
}

const GUIDES: Record<OnboardingTarget, string> = {
  claude: guide("Claude Code", [
    "1. Add MCP server",
    "   $ claude mcp add codemap-mcp -- npx -y @codemap/mcp-server",
  ]),

  cursor: guide("Cursor", [
    "1. Add MCP server — create or edit .cursor/mcp.json:",
    MCP_JSON_SNIPPET("mcpServers"),
    "   Then restart Cursor.",
  ]),

  codex: guide("Codex", [
    "1. Add MCP server — add to ~/.codex/config.toml:",
    "  [mcp_servers.codemap]",
    "  command = \"npx\"",
    "  args = [\"-y\", \"@codemap/mcp-server\"]",
  ]),

  gemini: guide("Gemini CLI", [
    "1. Add MCP server — edit ~/.gemini/settings.json:",
    MCP_JSON_SNIPPET("mcpServers"),
  ]),

  opencode: guide("OpenCode", [
    "1. Add MCP server — edit opencode.json (project root):",
    [
      "  {",
      "    \"mcp\": {",
      "      \"codemap-mcp\": {",
      "        \"command\": \"npx\",",
      "        \"args\": [\"-y\", \"@codemap/mcp-server\"],",
      "        \"enabled\": true",
      "      }",
      "    }",
      "  }",
    ].join("\n"),
  ]),

  copilot: guide("GitHub Copilot (VS Code)", [
    "1. Add MCP server — create or edit .vscode/mcp.json:",
    MCP_JSON_SNIPPET("servers"),
    "   Then reload VS Code (Ctrl+Shift+P → Developer: Reload Window).",
  ]),
};

export function buildOnboardingGuide(target: OnboardingTarget | "all"): string {
  if (target === "all") {
    return (Object.keys(GUIDES) as OnboardingTarget[])
      .map((t) => GUIDES[t])
      .join("\n\n");
  }
  return GUIDES[target];
}

export function isOnboardingTarget(value: string): value is OnboardingTarget {
  return value in GUIDES;
}
