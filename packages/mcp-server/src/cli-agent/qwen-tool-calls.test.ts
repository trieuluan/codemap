import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQwenToolPrompt,
  extractQwenXmlToolCalls,
  isQwenToolModel,
} from "./qwen-tool-calls.js";
import { NineRouterProvider } from "./provider.js";
import type { ChatToolDefinition } from "./types.js";

const allowed = ["search_codebase", "get_file", "bash", "get_project_map"];
const searchTool: ChatToolDefinition = {
  type: "function",
  function: {
    name: "search_codebase",
    description: "Search indexed code",
    parameters: { properties: { query: { type: "string" } } },
  },
};

test("detects Qwen-style model ids", () => {
  assert.equal(isQwenToolModel("kr/qwen3-coder-next"), true);
  assert.equal(isQwenToolModel("Qwen/Qwen3-Coder"), true);
  assert.equal(isQwenToolModel("anthropic/claude-sonnet-4"), false);
});

test("builds Qwen XML prompt with real tool names and parameter names", () => {
  const prompt = buildQwenToolPrompt([searchTool]);
  assert.match(prompt, /<tool_call>/);
  assert.match(prompt, /search_codebase/);
  assert.match(prompt, /query/);
  assert.match(prompt, /Do not invent tools/);
});

test("parses one XML tool call with string parameters", () => {
  const result = extractQwenXmlToolCalls(
    `Before
<tool_call>
<function=search_codebase>
<parameter=query>
agent loop
</parameter>
</function>
</tool_call>`,
    allowed,
  );

  assert.equal(result.visibleText.trim(), "Before");
  assert.equal(result.incompleteRemainder, "");
  assert.deepEqual(result.unknownToolNames, []);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.function.name, "search_codebase");
  assert.deepEqual(JSON.parse(result.toolCalls[0]!.function.arguments), {
    query: "agent loop",
  });
});

test("parses multiple XML tool calls and strips them from visible text", () => {
  const result = extractQwenXmlToolCalls(
    `A<tool_call><function=search_codebase><parameter=query>x</parameter></function></tool_call>B<tool_call><function=get_file><parameter=path>src/a.ts</parameter></function></tool_call>C`,
    allowed,
  );

  assert.equal(result.visibleText, "ABC");
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls[0]?.function.name, "search_codebase");
  assert.equal(result.toolCalls[1]?.function.name, "get_file");
});

test("keeps an incomplete XML tool call as remainder for the next chunk", () => {
  const first = extractQwenXmlToolCalls(
    "Intro <tool_call><function=search_codebase><parameter=query>agent",
    allowed,
  );
  assert.equal(first.visibleText, "Intro ");
  assert.equal(first.toolCalls.length, 0);
  assert.match(first.incompleteRemainder, /<tool_call>/);

  const second = extractQwenXmlToolCalls(
    `${first.incompleteRemainder} loop</parameter></function></tool_call>`,
    allowed,
  );
  assert.equal(second.toolCalls.length, 1);
  assert.deepEqual(JSON.parse(second.toolCalls[0]!.function.arguments), {
    query: "agent loop",
  });
});

test("does not create tool calls for unknown tools", () => {
  const result = extractQwenXmlToolCalls(
    "<tool_call><function=read_file><parameter=path>package.json</parameter></function></tool_call>",
    allowed,
  );

  assert.equal(result.visibleText, "");
  assert.equal(result.toolCalls.length, 0);
  assert.deepEqual(result.unknownToolNames, ["read_file"]);
});

test("preserves normal text when no XML tool calls are present", () => {
  const result = extractQwenXmlToolCalls("Plain response", allowed);
  assert.equal(result.visibleText, "Plain response");
  assert.equal(result.toolCalls.length, 0);
  assert.equal(result.incompleteRemainder, "");
});

test("parses fenced bash blocks as bash command tool calls", () => {
  const result = extractQwenXmlToolCalls(
    "Run this\n```bash\nfind . -type f | head -50\n```",
    allowed,
  );

  assert.equal(result.visibleText.trim(), "Run this");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.function.name, "bash");
  assert.deepEqual(JSON.parse(result.toolCalls[0]!.function.arguments), {
    command: "find . -type f | head -50",
  });
});

test("parses bare fenced bash blocks with tool name on first line", () => {
  const result = extractQwenXmlToolCalls(
    "Run this\n```\nbash\nfind . -type f | head -50\n```",
    allowed,
  );

  assert.equal(result.visibleText.trim(), "Run this");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.function.name, "bash");
  assert.deepEqual(JSON.parse(result.toolCalls[0]!.function.arguments), {
    command: "find . -type f | head -50",
  });
});

test("keeps an incomplete bare fenced bash block as remainder", () => {
  const first = extractQwenXmlToolCalls(
    "Intro\n```\nbash\nfind . -type f -",
    allowed,
  );
  assert.equal(first.visibleText.trim(), "Intro");
  assert.equal(first.toolCalls.length, 0);
  assert.match(first.incompleteRemainder, /^```\nbash/);

  const second = extractQwenXmlToolCalls(
    first.incompleteRemainder + 'name "*.ts" | head -50\n```',
    allowed,
  );
  assert.equal(second.toolCalls.length, 1);
  assert.deepEqual(JSON.parse(second.toolCalls[0]!.function.arguments), {
    command: 'find . -type f -name "*.ts" | head -50',
  });
});

test("parses fenced no-argument tool names as empty argument tool calls", () => {
  const result = extractQwenXmlToolCalls(
    "Map please\n```get_project_map\n```",
    allowed,
  );

  assert.equal(result.visibleText.trim(), "Map please");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.function.name, "get_project_map");
  assert.deepEqual(JSON.parse(result.toolCalls[0]!.function.arguments), {});
});

test("parses bare fenced no-argument tool names", () => {
  const result = extractQwenXmlToolCalls(
    "Map please\n```\nget_project_map\n```",
    allowed,
  );

  assert.equal(result.visibleText.trim(), "Map please");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.function.name, "get_project_map");
  assert.deepEqual(JSON.parse(result.toolCalls[0]!.function.arguments), {});
});

test("parses split bare fenced bash followed by get_project_map", () => {
  const first = extractQwenXmlToolCalls(
    "Reading\n```\nbash\nfind . -type f -",
    allowed,
  );
  const second = extractQwenXmlToolCalls(
    [
      first.incompleteRemainder + 'name "*.ts" | head -50',
      "```",
      "",
      "Then",
      "```",
      "get_project_map",
      "```",
      "",
      "✓ Task complete.",
    ].join("\n"),
    allowed,
  );

  assert.equal(second.toolCalls.length, 2);
  assert.equal(second.toolCalls[0]?.function.name, "bash");
  assert.equal(second.toolCalls[1]?.function.name, "get_project_map");
});

test("does not execute unknown fenced tool names", () => {
  const result = extractQwenXmlToolCalls(
    "```read_file\npackage.json\n```",
    allowed,
  );

  assert.equal(result.toolCalls.length, 0);
  assert.deepEqual(result.unknownToolNames, ["read_file"]);
});

test("provider complete converts Qwen XML text into tool calls", async () => {
  const restoreFetch = mockFetch(
    new Response(JSON.stringify({
      model: "qwen3-coder-next",
      choices: [
        {
          message: {
            content:
              "<tool_call><function=search_codebase><parameter=query>agent loop</parameter></function></tool_call>",
          },
        },
      ],
    })),
  );
  try {
    const provider = new NineRouterProvider("https://example.test", "key");
    const result = await provider.complete({
      model: "kr/qwen3-coder-next",
      messages: [{ role: "user", content: "read code" }],
      tools: [searchTool],
    });

    assert.equal(result.text, "");
    assert.equal(result.toolCalls?.length, 1);
    assert.equal(result.toolCalls?.[0]?.function.name, "search_codebase");
    assert.deepEqual(JSON.parse(result.toolCalls![0]!.function.arguments), {
      query: "agent loop",
    });
  } finally {
    restoreFetch();
  }
});

test("provider stream preserves native OpenAI tool calls and usage", async () => {
  const restoreFetch = mockFetch(
    sseResponse([
      {
        model: "qwen3-coder-next",
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: "search_codebase", arguments: "{\"query\":\"x\"}" },
                },
              ],
            },
          },
        ],
      },
      {
        model: "qwen3-coder-next",
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      },
      "[DONE]",
    ]),
  );
  try {
    const provider = new NineRouterProvider("https://example.test", "key");
    const chunks = await collectStream(provider.stream({
      model: "kr/qwen3-coder-next",
      messages: [{ role: "user", content: "read code" }],
      tools: [searchTool],
    }));

    assert.equal(chunks.some((chunk) => chunk.usage?.totalTokens === 3), true);
    const toolChunk = chunks.find((chunk) => chunk.toolCalls);
    assert.equal(toolChunk?.toolCalls?.[0]?.function.name, "search_codebase");
  } finally {
    restoreFetch();
  }
});

test("provider stream converts Qwen XML text into tool call chunks", async () => {
  const restoreFetch = mockFetch(
    sseResponse([
      {
        model: "qwen3-coder-next",
        choices: [
          {
            delta: {
              content:
                "<tool_call><function=search_codebase><parameter=query>agent loop</parameter></function></tool_call>",
            },
          },
        ],
      },
      "[DONE]",
    ]),
  );
  try {
    const provider = new NineRouterProvider("https://example.test", "key");
    const chunks = await collectStream(provider.stream({
      model: "kr/qwen3-coder-next",
      messages: [{ role: "user", content: "read code" }],
      tools: [searchTool],
    }));

    const toolChunk = chunks.find((chunk) => chunk.toolCalls);
    assert.equal(toolChunk?.text, "");
    assert.equal(toolChunk?.toolCalls?.[0]?.function.name, "search_codebase");
    assert.deepEqual(JSON.parse(toolChunk!.toolCalls![0]!.function.arguments), {
      query: "agent loop",
    });
  } finally {
    restoreFetch();
  }
});

test("provider stream emits separate Qwen fenced tool calls across chunks", async () => {
  const restoreFetch = mockFetch(
    sseResponse([
      {
        model: "qwen3-coder-next",
        choices: [
          {
            delta: {
              content: "Intro\n```\nbash\nfind . -type f | head -50\n```",
            },
          },
        ],
      },
      {
        model: "qwen3-coder-next",
        choices: [
          {
            delta: {
              content: "\nThen\n```\nget_project_map\n```",
            },
          },
        ],
      },
      "[DONE]",
    ]),
  );
  try {
    const provider = new NineRouterProvider("https://example.test", "key");
    const chunks = await collectStream(provider.stream({
      model: "kr/qwen3-coder-next",
      messages: [{ role: "user", content: "read code" }],
      tools: [
        searchTool,
        {
          type: "function",
          function: { name: "bash", parameters: { properties: { command: { type: "string" } } } },
        },
        { type: "function", function: { name: "get_project_map" } },
      ],
    }));

    const toolChunks = chunks.filter((chunk) => chunk.toolCalls);
    assert.equal(toolChunks.length, 2);
    assert.equal(toolChunks[0]?.text, "");
    assert.equal(toolChunks[0]?.toolCalls?.[0]?.function.name, "bash");
    assert.equal(toolChunks[1]?.text, "");
    assert.equal(toolChunks[1]?.toolCalls?.[0]?.function.name, "get_project_map");
  } finally {
    restoreFetch();
  }
});

function mockFetch(response: Response): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => response) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function sseResponse(chunks: Array<Record<string, unknown> | "[DONE]">): Response {
  const body = chunks
    .map((chunk) => `data: ${chunk === "[DONE]" ? chunk : JSON.stringify(chunk)}\n\n`)
    .join("");
  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });
}

async function collectStream<T>(stream: AsyncGenerator<T>): Promise<T[]> {
  const chunks: T[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
