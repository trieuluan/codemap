import assert from "node:assert/strict";
import test from "node:test";
import {
  getResolvedModel,
  installResolvedModelInterceptor,
  uninstallFetchInterceptor,
} from "./fetch-interceptor.js";

test("captures the resolved model from the first SSE chunk before the stream completes", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  let releaseSecondChunk: (() => void) | undefined;

  globalThis.fetch = async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"model":"9router/coder","delta":"hi"}\n'),
        );
        releaseSecondChunk = () => {
          controller.enqueue(encoder.encode('data: [DONE]\n'));
          controller.close();
        };
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    installResolvedModelInterceptor("https://api.example.com");
    const responsePromise = fetch("https://api.example.com/v1/chat/completions");

    await responsePromise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(getResolvedModel(), "9router/coder");

    releaseSecondChunk?.();
  } finally {
    uninstallFetchInterceptor();
    globalThis.fetch = originalFetch;
  }
});
