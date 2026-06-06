import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { success, withToolError } from "@codemap-ai/core/lib/tool-response.js";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, String.fromCharCode(34))
    .trim();
}

async function searchDuckDuckGo(
  query: string,
  numResults: number,
): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // Extract result blocks from DDG HTML
  const linkRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex =
    /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: { url: string; title: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    const uddgMatch = href.match(/uddg=([^&]*)/);
    if (uddgMatch) {
      href = decodeURIComponent(uddgMatch[1]);
    }
    const title = decodeEntities(match[2]);
    if (title && href) {
      links.push({ url: href, title });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    const snippet = decodeEntities(match[1]);
    if (snippet) {
      snippets.push(snippet);
    }
  }

  for (let i = 0; i < Math.min(links.length, numResults); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? "",
    });
  }

  return results;
}

async function searchInstantAnswer(query: string): Promise<SearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "CodeMap-MCP/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo API returned ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const results: SearchResult[] = [];

  const abstract = data.Abstract as string | undefined;
  const abstractUrl = data.AbstractURL as string | undefined;
  if (abstract && abstractUrl) {
    results.push({
      title: (data.Heading as string) ?? "Result",
      url: abstractUrl,
      snippet: abstract,
    });
  }

  const relatedTopics = data.RelatedTopics as
    | Record<string, unknown>[]
    | undefined;
  if (relatedTopics) {
    for (const topic of relatedTopics.slice(0, 5)) {
      const text = topic.Text as string | undefined;
      const firstUrl = topic.FirstURL as string | undefined;
      if (text && firstUrl) {
        results.push({
          title: text.split(" - ")[0] ?? text.slice(0, 80),
          url: firstUrl,
          snippet: text,
        });
      }
    }
  }

  return results;
}

function formatResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No web search results found for "${query}".`;
  }

  const lines = [`Web search results for "${query}":`, ""];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.title} — ${r.url}`);
    if (r.snippet) {
      lines.push(`   ${r.snippet}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function registerWebSearchTool(server: McpServer) {
  server.registerTool(
    "web_search",
    {
      title: "Web Search",
      description:
        "Search the web using DuckDuckGo. Returns titles, URLs, and snippets. " +
        "Use for current events, documentation lookups, package version checks, " +
        "or any information not available in the local codebase.",
      inputSchema: {
        query: z.string().min(1).describe("Search query string."),
        numResults: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .default(5)
          .describe("Number of results to return (1-10, default 5)."),
      },
    },
    withToolError(async ({ query, numResults }) => {
      let results: SearchResult[];

      try {
        results = await searchDuckDuckGo(query, numResults);
      } catch {
        results = await searchInstantAnswer(query);
      }

      const text = formatResults(query, results);
      return success(text, { query, results });
    }),
  );
}
