import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSessionSnapshot } from "@codemap-ai/core/agent/session";
import { createWebApi, type EventStream } from "./api.js";

function setup() {
  const stream: EventStream = { onmessage: null, onerror: null, close() {} };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createWebApi({
    fetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json(url.includes("bootstrap")
        ? { workspacePath: "/repo", status: "ready", settings: null, snapshot: createInitialSessionSnapshot() }
        : { result: null });
    },
    eventSource: () => stream,
    openUrl: () => {},
  });
  return { api, stream, calls, emit: (value: unknown) => stream.onmessage?.({ data: JSON.stringify(value) }) };
}

test("late subscribers receive authoritative snapshot including streamed tokens", async () => {
  const { api, emit } = setup();
  await api.bootstrap();
  emit({ type: "agent_event", event: { type: "snapshot", snapshot: createInitialSessionSnapshot() } });
  emit({ type: "agent_event", event: { type: "token", requestId: "r", text: "hello" } });
  const texts: string[] = [];
  api.onAgentEvent(event => { if (event.type === "snapshot") texts.push(event.snapshot.streamingText); });
  assert.deepEqual(texts, ["hello"]);
});

test("reconnect snapshot replaces streamed state without resending commands", async () => {
  const { api, emit, stream, calls } = setup();
  await api.bootstrap();
  await api.writeFile("a.ts", "new");
  const statuses: string[] = [];
  api.onRuntimeStatus(s => statuses.push(s));
  stream.onerror?.();
  emit({ type: "runtime_status", status: "ready" });
  const snapshot = { ...createInitialSessionSnapshot(), streamingText: "authoritative" };
  emit({ type: "agent_event", event: { type: "snapshot", snapshot } });
  let restored = "";
  api.onAgentEvent(event => { if (event.type === "snapshot") restored = event.snapshot.streamingText; });
  assert.equal(restored, "authoritative");
  assert.deepEqual(statuses, ["ready", "disconnected", "ready"]);
  assert.equal(calls.filter(c => c.init?.method === "POST").length, 1);
});

test("failed mutation surfaces error and is never automatically retried", async () => {
  let attempts = 0;
  const api = createWebApi({
    fetch: async () => { attempts++; return Response.json({ error: "permission denied" }, { status: 403 }); },
    eventSource: () => ({ onmessage: null, onerror: null, close() {} }), openUrl: () => {},
  });
  await assert.rejects(api.writeFile("secret", "data"), /permission denied/);
  assert.equal(attempts, 1);
  await assert.rejects(api.openUrl("file:///etc/passwd"), /HTTP/);
});

test("send failure exits optimistic running state and reports the error", async () => {
  const api = createWebApi({
    fetch: async () => Response.json({ error: "Configure a model first" }, { status: 400 }),
    eventSource: () => ({ onmessage: null, onerror: null, close() {} }), openUrl: () => {},
  });
  const errors: string[] = [];
  api.onAgentEvent(event => { if (event.type === "error") errors.push(event.message); });
  await assert.rejects(api.send("hello"), /Configure/);
  assert.deepEqual(errors, ["Configure a model first"]);
});
