import type { Command, CommandContext } from "./types.js";
import type { TreeNode } from "../session-tree.js";
import { C_SUCCESS, C_ERROR, C_DIM, C_CYAN, RESET, C_WARNING } from "../../tui/theme.js";

function pad(n: number): string {
  return "  ".repeat(n);
}

function stripThinkTags(text: string): string {
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<think\b[^>]*\/?>/gi, "")
    .replace(/<\/think>/gi, "")
    .trim();
}

function extractTaskContent(raw: string): string {
  const match = raw.match(/<task>\n([\s\S]*?)\n<\/task>/);
  return match?.[1]?.trim() ?? raw.trim();
}

function cleanPreview(raw: string | undefined, maxLen: number): string {
  if (!raw) return "";
  return extractTaskContent(stripThinkTags(raw)).slice(0, maxLen).replace(/\n/g, " ");
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
    ? cleanPreview(node.entry.content, 60)
    : node.entry.id.slice(0, 8);
  const contentStr = isActive ? contentPreview : `${C_DIM}${contentPreview}${RESET}`;
  const line = `${pad(depth)}${marker}${branchMark}${typeTag}${contentStr} ${C_DIM}${ts}${RESET}`;

  // Only indent children when there's an actual branch (multiple children).
  // Linear chains stay at the same depth to avoid cascading indentation.
  const nextDepth = node.children.length > 1 ? depth + 1 : depth;
  const childLines = node.children.map((c) => renderNode(c, currentLeafId, nextDepth));
  return [line, ...childLines].join("\n");
}

function formatAge(ms: number): string {
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
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

    // Show current branch name
    let branchLabel = "";
    if (ctx.getMastraBranches) {
      const branches = await ctx.getMastraBranches(threadId ?? undefined);
      const active = branches.find((b) => b.isActive);
      if (active) {
        branchLabel = ` on ${C_CYAN}${active.name}${RESET}`;
      }
    }

    const header = branchCount > 0
      ? `${C_CYAN}Session Tree${RESET}${branchLabel} ${C_DIM}(${branchCount} branch point${branchCount === 1 ? "" : "s"}, ${C_SUCCESS}●${RESET}=active)${RESET}\n`
      : `${C_CYAN}Session Tree${RESET}${branchLabel} ${C_DIM}(linear, ${C_SUCCESS}●${RESET}=active)${RESET}\n`;

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

export const branchCommand: Command = {
  name: "branch",
  description: "Switch to a branch or manage branches (list, switch, delete)",
  async execute(args: string, ctx: CommandContext) {
    if (!ctx.getMastraBranches || !ctx.switchMastraBranch || !ctx.getMastraThreadTree || !ctx.getMastraActiveLeafId) {
      ctx.appendMessage({ role: "system", content: `${C_ERROR}Branch management not available.${RESET}` });
      return;
    }

    const threadId = ctx.getMastraThreadId?.();
    const trimmed = args.trim();

    // `/branch` with no args — list branches
    if (!trimmed) {
      const branches = await ctx.getMastraBranches(threadId ?? undefined);
      if (branches.length === 0) {
        ctx.appendMessage({ role: "system", content: `${C_DIM}No branches yet. Use /tree to create a branch.${RESET}` });
        return;
      }

      const sorted = [...branches].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });

      const lines = sorted.map((b) => {
        const activeMarker = b.isActive ? ` ${C_SUCCESS}●${RESET}` : "";
        const star = b.isActive ? " *" : "  ";
        const name = b.isActive ? `${C_CYAN}${b.name}${RESET}` : `${C_DIM}${b.name}${RESET}`;
        const preview = b.content
          ? `${C_DIM}"${cleanPreview(b.content, 40)}"${RESET}`
          : `${C_DIM}${b.leafId.slice(0, 8)}${RESET}`;
        const age = formatAge(Date.now() - b.updatedAt);
        return `  ${star} ${name}${activeMarker}  ${preview}  ${C_DIM}${age}${RESET}`;
      });

      const activeBranch = branches.find((b) => b.isActive);
      const activeLabel = activeBranch ? ` (active: ${activeBranch.name})` : "";

      ctx.appendMessage({
        role: "system",
        content: `${C_CYAN}Branches${RESET} ${C_DIM}(${branches.length})${activeLabel}${RESET}\n${lines.join("\n")}\n\n${C_DIM}Use /branch <name> to switch, /branch -d <name> to delete.${RESET}`,
      });
      return;
    }

    // `/branch -d <name>` — delete a branch
    if (trimmed.startsWith("-d ")) {
      const name = trimmed.slice(3).trim();
      if (!name) {
        ctx.appendMessage({ role: "system", content: `${C_WARNING}Usage: /branch -d <branch-name>${RESET}` });
        return;
      }
      if (!ctx.deleteMastraBranch) {
        ctx.appendMessage({ role: "system", content: `${C_ERROR}Branch deletion not available.${RESET}` });
        return;
      }
      const ok = await ctx.deleteMastraBranch(name, threadId ?? undefined);
      if (ok) {
        ctx.appendMessage({ role: "system", content: `${C_SUCCESS}Deleted branch "${name}".${RESET}` });
      } else {
        ctx.appendMessage({ role: "system", content: `${C_ERROR}Branch "${name}" not found.${RESET}` });
      }
      return;
    }

    // `/branch <name>` — switch to a branch
    const leafId = await ctx.switchMastraBranch(trimmed, threadId ?? undefined);
    if (!leafId) {
      ctx.appendMessage({ role: "system", content: `${C_ERROR}Branch "${trimmed}" not found.${RESET}` });
      return;
    }

    // Reload messages for the switched branch
    if (ctx.loadMastraThreadMessages && threadId) {
      await ctx.loadMastraThreadMessages(threadId);
    }

    ctx.appendMessage({
      role: "system",
      content: `${C_SUCCESS}Switched to branch "${trimmed}".${RESET} ${C_DIM}Leaf: ${leafId.slice(0, 8)}${RESET}`,
    });
  },
};
