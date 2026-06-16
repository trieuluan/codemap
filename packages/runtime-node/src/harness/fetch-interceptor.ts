type ResponseDebugInfo = {
  status: number;
  ok: boolean;
  contentType: string | null;
  bodyPreview: string;
};

type FetchInterceptorState = {
  lastModelApiError: Error | null;
  lastResponseInfo: ResponseDebugInfo | null;
  resolvedModel: string | null;
  uninstall: (() => void) | null;
};

const MAX_PREVIEW_LENGTH = 2000;

const state: FetchInterceptorState = {
  lastModelApiError: null,
  lastResponseInfo: null,
  resolvedModel: null,
  uninstall: null,
};

export function getLastModelApiError(): Error | null {
  return state.lastModelApiError;
}

/** Diagnostic snapshot of the last intercepted model API response — used to debug empty responses. */
export function getLastResponseDebugInfo(): ResponseDebugInfo | null {
  return state.lastResponseInfo;
}

export function getResolvedModel(): string | null {
  return state.resolvedModel;
}

export function resetResolvedModel(): void {
  state.resolvedModel = null;
}

export function uninstallFetchInterceptor(): void {
  state.uninstall?.();
}

/** Extract a human-readable message from an OpenAI-style `{"error": ...}` payload. */
function extractStreamErrorMessage(error: unknown): string | null {
  if (typeof error === "string" && error.trim()) return error;
  if (
    error &&
    typeof error === "object" &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.trim()
  ) {
    return (error as { message: string }).message;
  }
  return null;
}

function captureResolvedModelPayload(payload: string): boolean {
  if (!payload.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(payload) as { model?: unknown; error?: unknown };
    let captured = false;
    if (typeof parsed.model === "string" && parsed.model.trim()) {
      state.resolvedModel = parsed.model;
      captured = true;
    }
    const errorMessage = extractStreamErrorMessage(parsed.error);
    if (errorMessage) {
      state.lastModelApiError = new Error(errorMessage);
      captured = true;
    }
    return captured;
  } catch {
    // Ignore malformed JSON bodies; interceptor is best-effort only.
  }
  return false;
}

function captureResolvedModel(body: string): void {
  const trimmed = body.trim();
  if (!trimmed) return;

  if (captureResolvedModelPayload(trimmed)) return;

  for (const line of trimmed.split("\n")) {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!data || data === "[DONE]") continue;
    if (captureResolvedModelPayload(data)) return;
  }
}

async function captureResolvedModelFromStream(
  body: ReadableStream<Uint8Array>,
  responseMeta: { status: number; ok: boolean; contentType: string | null },
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let preview = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value, { stream: true });
      if (preview.length < MAX_PREVIEW_LENGTH) {
        preview += chunkText.slice(0, MAX_PREVIEW_LENGTH - preview.length);
      }
      buffered += chunkText;

      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.startsWith("data:") ? line.slice(5).trim() : "";
        if (!data || data === "[DONE]") continue;
        if (captureResolvedModelPayload(data)) {
          state.lastResponseInfo = { ...responseMeta, bodyPreview: preview };
        }
      }
    }

    const trailing = `${buffered}${decoder.decode()}`.trim();
    if (trailing) captureResolvedModel(trailing);
    state.lastResponseInfo = { ...responseMeta, bodyPreview: preview };
  } catch {
    // Ignore response body read errors; interceptor is best-effort only.
  } finally {
    reader.releaseLock();
  }
}

export function installResolvedModelInterceptor(baseUrl: string): void {
  state.uninstall?.();
  state.lastModelApiError = null;
  state.lastResponseInfo = null;
  state.resolvedModel = null;

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const original = globalThis.fetch;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = function (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): ReturnType<typeof fetch> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    const responsePromise = original.call(globalThis, input, init);
    if (!url.startsWith(normalizedBase)) return responsePromise;

    return responsePromise.then(async (response) => {
      const clonedBody = response.clone();
      const responseMeta = {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get("content-type"),
      };

      if (response.ok) {
        if (clonedBody.body) {
          void captureResolvedModelFromStream(clonedBody.body, responseMeta);
          return response;
        }

        let body = "";
        try {
          body = await clonedBody.text();
        } catch {
          // Ignore response body read errors; interceptor is best-effort only.
        }
        captureResolvedModel(body);
        state.lastResponseInfo = {
          ...responseMeta,
          bodyPreview: body.slice(0, MAX_PREVIEW_LENGTH),
        };
        return response;
      }

      let body = "";
      try {
        body = await clonedBody.text();
      } catch {
        // Ignore response body read errors; status still gives useful context.
      }

      const suffix = body.trim() ? `: ${body.trim()}` : "";
      state.lastModelApiError = new Error(
        `Model API request failed [${response.status}]${suffix}`,
      );
      state.lastResponseInfo = {
        ...responseMeta,
        bodyPreview: body.slice(0, MAX_PREVIEW_LENGTH),
      };
      return response;
    }) as ReturnType<typeof fetch>;
  };

  state.uninstall = () => {
    globalThis.fetch = original;
    state.uninstall = null;
  };
}
