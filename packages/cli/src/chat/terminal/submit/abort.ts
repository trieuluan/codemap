export function createAbortError(): Error {
  const err = new Error("Task canceled.");
  err.name = "AbortError";
  return err;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw createAbortError();
  let cleanup: (() => void) | undefined;
  const abortPromise = new Promise<T>((_, reject) => {
    const onAbort = () => reject(createAbortError());
    cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([
    promise.then(
      (value) => {
        cleanup?.();
        return value;
      },
      (err) => {
        cleanup?.();
        throw err;
      },
    ),
    abortPromise,
  ]);
}
