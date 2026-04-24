import type { McpServerConfig } from "../config.js";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
  authRequired?: boolean;
};

type UploadOptions = {
  query?: Record<string, string | undefined>;
  authRequired?: boolean;
};

/**
 * Creates a typed API client bound to a MCP server config.
 * All methods throw on HTTP errors — callers should wrap with `withToolError`.
 */
export function createCodeMapClient(config: McpServerConfig) {
  function buildUrl(path: string, query?: Record<string, string | undefined>) {
    const url = new URL(path, config.apiUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return url;
  }

  function buildAuthHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (config.apiToken) {
      headers["x-api-key"] = config.apiToken;
      headers["Authorization"] = `Bearer ${config.apiToken}`;
    }
    return headers;
  }

  async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `CodeMap API returned ${response.status} ${response.statusText}. ${body}`.trim(),
      );
    }

    const json = (await response.json()) as { data?: T };
    if (json.data === undefined) throw new Error("Unexpected response from API.");
    return json.data;
  }

  function checkAuth(required?: boolean) {
    if (required && !config.apiToken) {
      throw new Error("Not authenticated. Run `codemap-mcp login`.");
    }
  }

  async function request<T>(path: string, options?: RequestOptions): Promise<T> {
    checkAuth(options?.authRequired);

    const url = buildUrl(path, options?.query);
    const hasBody = options?.body !== undefined;
    const headers = buildAuthHeaders(hasBody ? { "Content-Type": "application/json" } : undefined);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: options?.method ?? "GET",
        headers,
        body: hasBody ? JSON.stringify(options!.body) : undefined,
      });
    } catch (error) {
      throw new Error(
        `Failed to reach CodeMap API at ${config.apiUrl}. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return handleResponse<T>(response);
  }

  async function upload<T>(
    path: string,
    buffer: Buffer,
    options?: UploadOptions,
  ): Promise<T> {
    checkAuth(options?.authRequired);

    const url = buildUrl(path, options?.query);
    const headers = buildAuthHeaders({ "Content-Type": "application/zip" });

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: buffer,
      });
    } catch (error) {
      throw new Error(
        `Failed to reach CodeMap API at ${config.apiUrl}. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return handleResponse<T>(response);
  }

  return { request, upload };
}

export type CodeMapClient = ReturnType<typeof createCodeMapClient>;
