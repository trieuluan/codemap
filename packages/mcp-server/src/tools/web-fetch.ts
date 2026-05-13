import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";

const MAX_CHARS = 30_000;
const TIMEOUT_MS = 15_000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Convert github.com file URL → raw.githubusercontent.com so we get plain text.
 * github.com/user/repo/blob/branch/path → raw.githubusercontent.com/user/repo/branch/path
 */
function toRawGithubUrl(url: string): string {
  const match = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/,
  );
  if (match) {
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`;
  }
  return url;
}

/** Strip HTML tags and collapse whitespace to produce readable plain text. */
function htmlToText(html: string): string {
  return html
    // Remove <script> and <style> blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Block elements → newlines
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|nav|main)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Remove remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function registerWebFetchTool(server: McpServer, _config: McpServerConfig) {
  server.registerTool(
    "web_fetch",
    {
      title: "Fetch URL",
      description:
        "Fetch the content of any URL and return it as readable text. " +
        "Automatically converts GitHub file URLs (github.com/.../blob/...) to raw content. " +
        "HTML pages are stripped to plain text. Markdown, JSON, and source code are returned as-is. " +
        "Use after web_search to read documentation, README files, changelogs, or library source code. " +
        "For GitHub repos, pass the file URL directly — no need to manually construct raw URLs.",
      inputSchema: {
        url: z
          .string()
          .url()
          .max(2000)
          .describe(
            "URL to fetch. GitHub blob URLs are auto-converted to raw content. " +
            "Examples: 'https://github.com/tanstack/query/blob/main/README.md', " +
            "'https://docs.example.com/api', 'https://raw.githubusercontent.com/...'",
          ),
        max_chars: z
          .number()
          .int()
          .min(500)
          .max(MAX_CHARS)
          .optional()
          .describe(`Maximum characters to return. Default: ${MAX_CHARS}.`),
      },
    },
    withToolError(async ({ url, max_chars }) => {
      const fetchUrl = toRawGithubUrl(url);
      const limit = max_chars ?? MAX_CHARS;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(fetchUrl, {
          signal: controller.signal,
          headers: { "User-Agent": UA },
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        return success(
          `HTTP ${response.status} ${response.statusText} — ${fetchUrl}`,
          { url: fetchUrl, status: response.status, ok: false },
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      const raw = await response.text();

      const isHtml = contentType.includes("text/html") || raw.trimStart().startsWith("<!DOCTYPE") || raw.trimStart().startsWith("<html");
      const text = isHtml ? htmlToText(raw) : raw;

      const truncated = text.length > limit
        ? text.slice(0, limit) + `\n\n... [truncated — ${text.length - limit} chars omitted]`
        : text;

      const sourceNote = fetchUrl !== url ? `\n(fetched raw from: ${fetchUrl})` : "";
      const summary = `${url}${sourceNote}\n\n${truncated}`;

      return success(summary, {
        url,
        fetchUrl,
        status: response.status,
        contentType,
        chars: text.length,
        truncated: text.length > limit,
        ok: true,
      });
    }),
  );
}
