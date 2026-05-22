import type { ChatToolCall, ChatToolDefinition } from "./types.js";

export interface QwenXmlToolCallExtraction {
  visibleText: string;
  toolCalls: ChatToolCall[];
  incompleteRemainder: string;
  unknownToolNames: string[];
}

const TOOL_CALL_OPEN = "<tool_call>";
const TOOL_CALL_CLOSE = "</tool_call>";
const FENCED_BLOCK_RE = /```([A-Za-z_][\w.-]*)?\s*\n?([\s\S]*?)```/g;

export function isQwenToolModel(model: string | undefined): boolean {
  if (!model) return false;
  const normalized = model.toLowerCase();
  return (
    normalized.includes("qwen") ||
    normalized.includes("qwen3") ||
    normalized.includes("qwen3-coder") ||
    normalized.includes("coder-next")
  );
}

export function buildQwenToolPrompt(tools: ChatToolDefinition[]): string {
  if (tools.length === 0) return "";

  const toolList = tools
    .map((tool) => {
      const params = extractParameterNames(tool.function.parameters);
      const description = tool.function.description
        ? `: ${tool.function.description}`
        : "";
      const parameterText = params.length > 0
        ? ` Parameters: ${params.join(", ")}.`
        : " Parameters: none.";
      return `- ${tool.function.name}${description}${parameterText}`;
    })
    .join("\n");

  return `## Qwen XML Tool Calling
When you need to use a tool, emit only XML tool calls in this exact format:
<tool_call>
<function=TOOL_NAME>
<parameter=PARAMETER_NAME>
value
</parameter>
</function>
</tool_call>

Use only tool names from the list below. Do not invent tools such as read_file, list_dir, or shell unless they are explicitly listed. Do not describe a tool call in prose. After emitting a tool call, stop and wait for the tool result.

Available tools:
${toolList}`;
}

export function extractQwenXmlToolCalls(
  text: string,
  allowedTools: Iterable<string>,
): QwenXmlToolCallExtraction {
  const allowed = new Set(Array.from(allowedTools));
  const fencedRemainderStart = findIncompleteFenceStart(text);
  const fencedRemainder = fencedRemainderStart === -1 ? "" : text.slice(fencedRemainderStart);
  const parseableText = fencedRemainderStart === -1 ? text : text.slice(0, fencedRemainderStart);
  const fencedExtraction = extractFencedToolCalls(parseableText, allowed);
  text = fencedExtraction.text;
  const toolCalls: ChatToolCall[] = [];
  const unknownToolNames: string[] = [...fencedExtraction.unknownToolNames];
  let visibleText = "";
  let cursor = 0;

  while (cursor < text.length) {
    const open = text.indexOf(TOOL_CALL_OPEN, cursor);
    if (open === -1) {
      visibleText += text.slice(cursor);
      return {
        visibleText,
        toolCalls: [
          ...fencedExtraction.toolCalls,
          ...renumberToolCalls(toolCalls, fencedExtraction.toolCalls.length),
        ],
        incompleteRemainder: fencedRemainder,
        unknownToolNames,
      };
    }

    visibleText += text.slice(cursor, open);
    const close = text.indexOf(TOOL_CALL_CLOSE, open + TOOL_CALL_OPEN.length);
    if (close === -1) {
      return {
        visibleText,
        toolCalls,
        incompleteRemainder: text.slice(open) + fencedRemainder,
        unknownToolNames,
      };
    }

    const blockEnd = close + TOOL_CALL_CLOSE.length;
    const block = text.slice(open, blockEnd);
    const parsed = parseToolCallBlock(block);
    if (parsed) {
      if (allowed.has(parsed.name)) {
        toolCalls.push({
          id: `qwen_call_${toolCalls.length}`,
          type: "function",
          function: {
            name: parsed.name,
            arguments: JSON.stringify(parsed.arguments),
          },
        });
      } else {
        unknownToolNames.push(parsed.name);
      }
    }
    cursor = blockEnd;
  }

  return {
    visibleText,
    toolCalls: [...fencedExtraction.toolCalls, ...renumberToolCalls(toolCalls, fencedExtraction.toolCalls.length)],
    incompleteRemainder: "",
    unknownToolNames,
  };
}

function findIncompleteFenceStart(text: string): number {
  const fencePositions = [...text.matchAll(/```/g)].map((match) => match.index ?? -1);
  if (fencePositions.length % 2 === 0) return -1;
  return fencePositions[fencePositions.length - 1] ?? -1;
}

function extractFencedToolCalls(
  text: string,
  allowed: Set<string>,
): { text: string; toolCalls: ChatToolCall[]; unknownToolNames: string[] } {
  const toolCalls: ChatToolCall[] = [];
  const unknownToolNames: string[] = [];
  const stripped = text.replace(FENCED_BLOCK_RE, (full, language: string | undefined, body: string) => {
    const parsedFence = parseFencedToolBlock(language, body);
    if (!parsedFence) return full;
    const { name, content } = parsedFence;
    if (!looksLikeToolName(name, allowed)) return full;
    if (!allowed.has(name)) {
      unknownToolNames.push(name);
      return "";
    }
    const args = fencedToolArguments(name, content);
    toolCalls.push({
      id: `qwen_call_${toolCalls.length}`,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    });
    return "";
  });

  return { text: stripped, toolCalls, unknownToolNames };
}

function parseFencedToolBlock(
  language: string | undefined,
  body: string,
): { name: string; content: string } | null {
  const trimmedLanguage = language?.trim();
  if (trimmedLanguage) return { name: trimmedLanguage, content: body };

  const normalized = body.replace(/^\s*\n/, "");
  const lineBreak = normalized.indexOf("\n");
  const firstLine = (lineBreak === -1 ? normalized : normalized.slice(0, lineBreak)).trim();
  if (!firstLine) return null;
  const content = lineBreak === -1 ? "" : normalized.slice(lineBreak + 1);
  return { name: firstLine, content };
}

function looksLikeToolName(name: string, allowed: Set<string>): boolean {
  return (
    allowed.has(name) ||
    name === "bash" ||
    name.includes("_") ||
    name.startsWith("get") ||
    name.startsWith("list") ||
    name.startsWith("search") ||
    name.startsWith("find")
  );
}

function fencedToolArguments(name: string, body: string): Record<string, string> {
  const content = body.trim();
  if (!content) return {};
  if (name === "bash") return { command: content };
  return { input: content };
}

function renumberToolCalls(
  toolCalls: ChatToolCall[],
  offset: number,
): ChatToolCall[] {
  if (offset === 0) return toolCalls;
  return toolCalls.map((toolCall, index) => ({
    ...toolCall,
    id: `qwen_call_${offset + index}`,
  }));
}

function extractParameterNames(parameters: Record<string, unknown> | undefined): string[] {
  const props = parameters?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return [];
  return Object.keys(props);
}

function parseToolCallBlock(
  block: string,
): { name: string; arguments: Record<string, string> } | null {
  const functionMatch = block.match(/<function=([^>\s]+)>([\s\S]*?)<\/function>/);
  if (!functionMatch) return null;

  const name = decodeXml(functionMatch[1]?.trim() ?? "");
  if (!name) return null;

  const body = functionMatch[2] ?? "";
  const args: Record<string, string> = {};
  const parameterPattern = /<parameter=([^>\s]+)>([\s\S]*?)<\/parameter>/g;
  for (const match of body.matchAll(parameterPattern)) {
    const key = decodeXml(match[1]?.trim() ?? "");
    if (!key) continue;
    args[key] = decodeXml((match[2] ?? "").trim());
  }

  return { name, arguments: args };
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
