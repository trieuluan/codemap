interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: unknown;
}

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiFailureResponse {
  success: false;
  error?: ApiErrorPayload;
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailureResponse;

export interface RequestApiOptions {
  method?: string;
  body?: unknown;
  cookieHeader?: string;
  cache?: RequestCache;
  headers?: HeadersInit;
  queryParams?: Record<
    string,
    | string
    | number
    | boolean
    | null
    | undefined
    | Array<string | number | boolean>
  >;
}

export interface ApiClientOptions {
  cookieHeader?: string;
}

export class ApiClientError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    options?: { code?: string; details?: unknown },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
  }
}

export function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return (
      process.env.API_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:3001"
    );
  }

  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

export async function parseApiResponse<T>(response: Response) {
  const payload = (await response
    .json()
    .catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.success) {
    const apiError = payload && !payload.success ? payload.error : undefined;

    throw new ApiClientError(
      apiError?.message || "Request failed",
      response.status,
      {
        code: apiError?.code,
        details: apiError?.details,
      },
    );
  }

  return payload.data;
}

export async function parseApiResponseWithMeta<T, M extends Record<string, unknown>>(
  response: Response,
): Promise<{ data: T; meta: M | undefined }> {
  const payload = (await response
    .json()
    .catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload?.success) {
    const apiError = payload && !payload.success ? payload.error : undefined;

    throw new ApiClientError(
      apiError?.message || "Request failed",
      response.status,
      {
        code: apiError?.code,
        details: apiError?.details,
      },
    );
  }

  return { data: payload.data, meta: payload.meta as M | undefined };
}

export async function requestApi<T>(
  path: string,
  options: RequestApiOptions = {},
) {
  const headers = new Headers(options.headers);
  const isServer = typeof window === "undefined";

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (isServer && options.cookieHeader) {
    headers.set("cookie", options.cookieHeader);
  }
  let url = `${getApiBaseUrl()}${path}`;
  if (options.queryParams) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.queryParams)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, String(v)));
        continue;
      }
      searchParams.set(key, String(value));
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: options.cache ?? "no-store",
    credentials: isServer ? "same-origin" : "include",
  });

  return parseApiResponse<T>(response);
}
