import type { McpServerConfig } from "../config.js";

export async function requestCodeMapApi<T>(
  config: McpServerConfig,
  path: string,
  options?: {
    method?: "GET" | "POST";
    body?: unknown;
    query?: Record<string, string | undefined>;
    authRequired?: boolean;
  },
) {
  if (options?.authRequired && !config.apiToken) {
    throw new Error("Not authenticated. Run `codemap-mcp login`.");
  }

  const url = new URL(path, config.apiUrl);

  for (const [key, value] of Object.entries(options?.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiToken) {
    headers["x-api-key"] = config.apiToken;
    headers.Authorization = `Bearer ${config.apiToken}`;
  }

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: options?.method ?? "GET",
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw new Error(
      `Failed to reach CodeMap API at ${config.apiUrl}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `CodeMap API returned ${response.status} ${response.statusText}. ${body}`.trim(),
    );
  }

  const json = (await response.json()) as {
    data?: T;
  };

  if (json.data === undefined) {
    throw new Error("Unexpected response from API.");
  }

  return json.data;
}

export function toToolErrorContent(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}
