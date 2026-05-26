/**
 * Intercepts process.stderr to swallow Mastra GatewayRegistry/GatewaySync
 * noise (ENOTFOUND models.dev) and track offline state for the status bar.
 */

let _gatewayOffline = false;

export function isGatewayOffline(): boolean {
  return _gatewayOffline;
}

export function installStderrInterceptor(): () => void {
  const original = process.stderr.write.bind(process.stderr);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = function (
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void,
  ): boolean {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    if (isGatewayNoise(text)) {
      _gatewayOffline = true;
      const callback = typeof encodingOrCb === "function" ? encodingOrCb : cb;
      callback?.();
      return true;
    }
    return (original as Function)(chunk, encodingOrCb, cb);
  };

  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stderr as any).write = original;
  };
}

function isGatewayNoise(text: string): boolean {
  return (
    text.includes("[GatewayRegistry]") ||
    text.includes("[GatewaySync]") ||
    (text.includes("models.dev") && (text.includes("fetch failed") || text.includes("ENOTFOUND")))
  );
}
