type FetchInterceptorState = {
  lastModelApiError: Error | null;
  resolvedModel: string | null;
  uninstall: (() => void) | null;
};

const state: FetchInterceptorState = {
  lastModelApiError: null,
  resolvedModel: null,
  uninstall: null,
};

export function getLastModelApiError(): Error | null {
  return state.lastModelApiError;
}

export function getResolvedModel(): string | null {
  return state.resolvedModel;
}

export function uninstallFetchInterceptor(): void {
  state.uninstall?.();
}

function captureResolvedModelPayload(payload: string): boolean {
  if (!payload.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(payload) as { model?: unknown };
    if (typeof parsed.model === "string" && parsed.model.trim()) {
      state.resolvedModel = parsed.model;
      return true;
    }
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

async function captureResolvedModelFromStream(body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  try {
    while (state.resolvedModel === null) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });

      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.startsWith("data:") ? line.slice(5).trim() : "";
        if (!data || data === "[DONE]") continue;
        if (captureResolvedModelPayload(data)) return;
      }
    }

    const trailing = `${buffered}${decoder.decode()}`.trim();
    if (trailing) captureResolvedModel(trailing);
  } catch {
    // Ignore response body read errors; interceptor is best-effort only.
  } finally {
    reader.releaseLock();
  }
}

export function installResolvedModelInterceptor(baseUrl: string): void {
  state.uninstall?.();
  state.lastModelApiError = null;
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

      if (response.ok) {
        if (clonedBody.body) {
          void captureResolvedModelFromStream(clonedBody.body);
          return response;
        }

        let body = "";
        try {
          body = await clonedBody.text();
        } catch {
          // Ignore response body read errors; interceptor is best-effort only.
        }
        captureResolvedModel(body);
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
      return response;
    }) as ReturnType<typeof fetch>;
  };

  state.uninstall = () => {
    globalThis.fetch = original;
    state.uninstall = null;
  };
}
