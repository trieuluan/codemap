import type { RequestContext } from "@mastra/core/request-context";
import type { MastraHarness } from "../events.ts";

const ORIGINAL_AGENT_INSTRUCTIONS = new WeakMap<
  object,
  (options?: { requestContext?: RequestContext }) => unknown
>();
const APPLIED_AGENT_INSTRUCTIONS = new WeakMap<object, string>();

function stringifyInstructions(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(stringifyInstructions).filter(Boolean).join("\n\n");
  }
  if (typeof value === "object") {
    const content = (value as { content?: unknown }).content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return stringifyInstructions(content);
  }
  return String(value);
}

async function resolveAgentInstructions(
  instructions: unknown,
  options?: { requestContext?: RequestContext },
): Promise<unknown> {
  if (typeof instructions === "function") {
    return (
      instructions as (options?: { requestContext?: RequestContext }) => unknown
    )(options);
  }
  return instructions;
}

function getModeAgents(harness: MastraHarness): object[] {
  const maybeHarness = harness as MastraHarness & {
    listModes?: () => Array<{ agent?: unknown }>;
    getState?: () => unknown;
  };
  const state = maybeHarness.getState?.();
  const agents: object[] = [];
  for (const mode of maybeHarness.listModes?.() ?? []) {
    const rawAgent =
      typeof mode.agent === "function"
        ? (mode.agent as (state: unknown) => unknown)(state)
        : mode.agent;
    if (rawAgent && typeof rawAgent === "object") agents.push(rawAgent);
  }
  return [...new Set(agents)];
}

/**
 * Hardening directive appended to every agent's instructions to prevent
 * models from outputting raw XML tool-call syntax in text content.
 */
const TOOL_CALL_FORMAT_DIRECTIVE = `## Tool Call Format
NEVER output XML tool call syntax (like <invoke>, <parameter>, <tool_name>) in your text responses. Always use structured tool_call events for tool invocations. If you find yourself writing XML tags to invoke tools, stop immediately and use the proper tool_call mechanism instead.`;

export function applyAgentInstructions(
  harness: MastraHarness,
  instructions?: string,
): void {
  // Merge caller instructions with the hardening directive.
  const merged = [instructions, TOOL_CALL_FORMAT_DIRECTIVE]
    .filter(Boolean)
    .join("\n\n");

  for (const agent of getModeAgents(harness)) {
    const writableAgent = agent as {
      __getOverridableFields?: () => { instructions?: unknown };
      __updateInstructions?: (instructions: unknown) => void;
    };
    if (!writableAgent.__updateInstructions) continue;
    if (APPLIED_AGENT_INSTRUCTIONS.get(agent) === merged) continue;

    const originalInstructions =
      writableAgent.__getOverridableFields?.().instructions;
    const original =
      ORIGINAL_AGENT_INSTRUCTIONS.get(agent) ??
      ((options?: { requestContext?: RequestContext }) =>
        resolveAgentInstructions(originalInstructions, options));
    if (!original) continue;
    ORIGINAL_AGENT_INSTRUCTIONS.set(agent, original);
    APPLIED_AGENT_INSTRUCTIONS.set(agent, merged);

    writableAgent.__updateInstructions(
      async (options?: { requestContext?: RequestContext }) => {
        const base = stringifyInstructions(await original(options));
        return [
          merged,
          "# CodeMap Instruction Priority",
          "The CodeMap identity and instructions above override any internal runtime/product names in the base prompt below.",
          base,
        ]
          .filter(Boolean)
          .join("\n\n---\n\n");
      },
    );
  }
}
