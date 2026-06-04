import type { Command, CommandContext } from "./types.js";
import type { TreeNode } from "../session-tree.js";
import { C_SUCCESS, C_ERROR, C_DIM, C_CYAN, RESET } from "../../tui/theme.js";

function pad(n: number): string {
  return "  ".repeat(n);
}

function renderNode(node: TreeNode, currentLeafId: string | null, depth: number): string {
  const isActive = node.entry.id === currentLeafId;
  const marker = isActive ? `${C_SUCCESS}●${RESET} ` : `${C_DIM}○${RESET} `;
  const branchMark = node.children.length > 1 ? `${C_CYAN}⑂${RESET} ` : "  ";
  const ts = new Date(node.entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const typeTag = node.entry.type === "branch_summary"
    ? `${C_DIM}[branch summary]${RESET} `
    : node.entry.type === "user"
      ? `${C_DIM}[user]${RESET} `
      : "";
  const contentPreview = node.entry.content
    ? node.entry.content.slice(0, 60).replace(/\n/g, " ")
    : node.entry.id.slice(0, 8);
  const contentStr = isActive ? contentPreview : `${C_DIM}${contentPreview}${RESET}`;
  const line = `${pad(depth)}${marker}${branchMark}${typeTag}${contentStr} ${C_DIM}${ts}${RESET}`;

  // Only indent children when there's an actual branch (multiple children).
  // Linear chains stay at the same depth to avoid cascading indentation.
  const nextDepth = node.children.length > 1 ? depth + 1 : depth;
  const childLines = node.children.map((c) => renderNode(c, currentLeafId, nextDepth));
  return [line, ...childLines].join("\n");
}

export const treeCommand: Command = {
  name: "tree",
  description: "Interactive session tree navigator (pi.dev-style)",
  triggerTreePicker: true,
  async execute(_args: string, ctx: CommandContext) {
    // Fallback for non-pi-tui contexts: render the text tree.
    if (!ctx.getMastraThreadTree) {
      ctx.appendMessage({ role: "system", content: `${C_ERROR}Session tree not available.${RESET}` });
      return;
    }

    const threadId = ctx.getMastraThreadId?.();
    const tree = await ctx.getMastraThreadTree(threadId ?? undefined);
    if (!tree || tree.length === 0) {
      ctx.appendMessage({ role: "system", content: `${C_DIM}No tree data for current session.${RESET}` });
      return;
    }

    const leafId = ctx.getMastraActiveLeafId ? await ctx.getMastraActiveLeafId(threadId ?? undefined) : null;
    const rendered = tree.map((root) => renderNode(root, leafId, 0)).join("\n");

    const branchCount = tree.reduce((sum, r) => {
      const count = (node: TreeNode): number =>
        (node.children.length > 1 ? 1 : 0) + node.children.reduce((s, c) => s + count(c), 0);
      return sum + count(r);
    }, 0);

    const header = branchCount > 0
      ? `${C_CYAN}Session Tree${RESET} ${C_DIM}(${branchCount} branch point${branchCount === 1 ? "" : "s"}, ${C_SUCCESS}●${RESET}=active)${RESET}\n`
      : `${C_CYAN}Session Tree${RESET} ${C_DIM}(linear, ${C_SUCCESS}●${RESET}=active)${RESET}\n`;

    ctx.appendMessage({
      role: "system",
      content: `${header}${rendered}`,
    });
  },
};

export const forkCommand: Command = {
  name: "fork",
  description: "Fork current session from a selected user message into a new thread",
  triggerForkPicker: true,
  async execute(_args: string, _ctx: CommandContext) {
    // Handled by pi-tui app via triggerForkPicker — this fallback should not run
  },
};

export const branchesCommand: Command = {
  name: "branches",
  description: "List branch points in the current session tree",
  async execute(_args: string, ctx: CommandContext) {
    if (!ctx.getMastraThreadTree) {
      ctx.appendMessage({ role: "system", content: `${C_ERROR}Session tree not available.${RESET}` });
      return;
    }

    const threadId = ctx.getMastraThreadId?.();
    const tree = await ctx.getMastraThreadTree(threadId ?? undefined);
    if (!tree || tree.length === 0) {
      ctx.appendMessage({ role: "system", content: `${C_DIM}No tree data for current session.${RESET}` });
      return;
    }

    // Collect all branch points
    const branchPoints: Array<{ entryId: string; childCount: number; preview: string }> = [];
    const walk = (node: TreeNode) => {
      if (node.children.length > 1) {
        branchPoints.push({
          entryId: node.entry.id,
          childCount: node.children.length,
          preview: node.entry.content?.slice(0, 50).replace(/\n/g, " ") ?? node.entry.id.slice(0, 8),
        });
      }
      node.children.forEach(walk);
    };
    tree.forEach(walk);

    if (branchPoints.length === 0) {
      ctx.appendMessage({ role: "system", content: `${C_DIM}No branch points — conversation is linear.${RESET}` });
      return;
    }

    const leafId = ctx.getMastraActiveLeafId ? await ctx.getMastraActiveLeafId(threadId ?? undefined) : null;
    const lines = branchPoints.map((bp) => {
      const active = bp.entryId === leafId ? ` ${C_SUCCESS}(active)${RESET}` : "";
      return `  ${bp.entryId.slice(0, 8)}${active} — ${bp.childCount} children — "${C_DIM}${bp.preview}${RESET}"`;
    });

    ctx.appendMessage({
      role: "system",
      content: `${C_CYAN}Branch Points${RESET} ${C_DIM}(${branchPoints.length})${RESET}\n${lines.join("\n")}\n\n${C_DIM}Use /tree to navigate, /fork to create a new session.${RESET}`,
    });
  },
};
