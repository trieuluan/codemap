type FetchInterceptorState = {
  currentEffort: "low" | "medium" | "high" | null;
  lastModelApiError: Error | null;
  uninstall: (() => void) | null;
};

const state: FetchInterceptorState = {
  currentEffort: null,
  lastModelApiError: null,
  uninstall: null,
};

export function setCurrentEffort(
  effort: "low" | "medium" | "high" | null,
): void {
  state.currentEffort = effort;
}

export function getLastModelApiError(): Error | null {
  return state.lastModelApiError;
}

export function uninstallFetchInterceptor(): void {
  state.uninstall?.();
}

export function installTemperatureInterceptor(baseUrl: string): void {
  state.uninstall?.();
  state.lastModelApiError = null;

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

    if (
      url.startsWith(normalizedBase) &&
      (init?.method ?? "GET").toUpperCase() === "POST" &&
      typeof init?.body === "string"
    ) {
      try {
        const parsed = JSON.parse(init.body) as Record<string, unknown>;
        let changed = false;
        if ("temperature" in parsed) {
          delete parsed.temperature;
          changed = true;
        }
        if (state.currentEffort) {
          parsed.reasoning_effort = state.currentEffort;
          changed = true;
        }
        if (changed) init = { ...init, body: JSON.stringify(parsed) };
      } catch {
        // not JSON — pass through unchanged
      }
    }

    const responsePromise = original.call(globalThis, input, init);
    if (!url.startsWith(normalizedBase)) return responsePromise;

    return responsePromise.then(async (response) => {
      if (response.ok) return response;
      let body = "";
      try {
        body = await response.clone().text();
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
