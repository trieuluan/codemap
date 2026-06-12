import assert from "node:assert/strict";
import test from "node:test";
import {
  getLastModelApiError,
  getResolvedModel,
  installResolvedModelInterceptor,
  uninstallFetchInterceptor,
} from "@codemap-ai/core/agent/harness";

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

test("captures an inline error chunk from a 200 OK SSE stream", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();

  globalThis.fetch = async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"error":{"message":"This model\'s maximum context length is 128000 tokens.","type":"invalid_request_error","code":"context_length_exceeded"}}\n',
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    installResolvedModelInterceptor("https://api.example.com");
    await fetch("https://api.example.com/v1/chat/completions");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const err = getLastModelApiError();
    assert.ok(err);
    assert.match(err.message, /maximum context length/);
    assert.equal(getResolvedModel(), null);
  } finally {
    uninstallFetchInterceptor();
    globalThis.fetch = originalFetch;
  }
});
