import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AGENT_PACK_CLAUDE_URI,
  AGENT_PACK_CODEX_URI,
  AGENT_PACK_CURSOR_URI,
  AGENT_PACK_GEMINI_URI,
  AGENT_PACK_INDEX_URI,
  AGENT_PACK_INSTALL_URI,
  AGENT_PACK_OPENCODE_URI,
  AGENT_PACK_COPILOT_URI,
  AGENT_PACK_SKILLS,
  AGENT_PACK_TEMPLATES,
  buildAgentPackIndexMarkdown,
  buildHarnessMarkdown,
  readAgentPackFile,
  readAgentPackSkill,
  skillResourceUri,
} from "../lib/agent-pack.js";

export function registerAgentPackResources(server: McpServer) {
  server.registerResource(
    "codemap-agent-pack-index",
    AGENT_PACK_INDEX_URI,
    {
      title: "CodeMap Agent Pack",
      description:
        "Superpowers-style CodeMap workflow pack: skills, rules, and installer guidance.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: buildAgentPackIndexMarkdown(),
        },
      ],
    }),
  );

  server.registerResource(
    "codemap-agent-pack-install",
    AGENT_PACK_INSTALL_URI,
    {
      title: "Install CodeMap Agent Pack",
      description:
        "Local install instructions for Codex, Claude, Cursor, Gemini, OpenCode, Copilot, marketplace, or all targets.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await readAgentPackFile("rules/install.md"),
        },
      ],
    }),
  );

  const harnessResources = [
    ["codemap-agent-pack-codex", AGENT_PACK_CODEX_URI, "codex"] as const,
    ["codemap-agent-pack-claude", AGENT_PACK_CLAUDE_URI, "claude"] as const,
    ["codemap-agent-pack-cursor", AGENT_PACK_CURSOR_URI, "cursor"] as const,
    ["codemap-agent-pack-gemini", AGENT_PACK_GEMINI_URI, "gemini"] as const,
    ["codemap-agent-pack-opencode", AGENT_PACK_OPENCODE_URI, "opencode"] as const,
    ["codemap-agent-pack-copilot", AGENT_PACK_COPILOT_URI, "copilot"] as const,
  ];

  for (const [name, resourceUri, harness] of harnessResources) {
    server.registerResource(
      name,
      resourceUri,
      {
        title: `CodeMap Agent Pack for ${harness}`,
        description: `Install and use CodeMap Agent Pack with ${harness}.`,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: buildHarnessMarkdown(harness),
          },
        ],
      }),
    );
  }

  for (const skill of AGENT_PACK_SKILLS) {
    server.registerResource(
      `codemap-skill-${skill}`,
      skillResourceUri(skill),
      {
        title: `CodeMap skill: ${skill}`,
        description: `CodeMap Agent Pack skill: ${skill}.`,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: await readAgentPackSkill(skill),
          },
        ],
      }),
    );
  }

  for (const template of AGENT_PACK_TEMPLATES) {
    server.registerResource(
      `codemap-template-${template.id}`,
      template.uri,
      {
        title: `CodeMap template: ${template.title}`,
        description: `CodeMap Agent Pack artifact template: ${template.title}.`,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: await readAgentPackFile(template.path),
          },
        ],
      }),
    );
  }
}
