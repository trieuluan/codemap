import type { HarnessEvent, MastraHarness } from "../events.ts";

let drainResolve: (() => void) | null = null;
let drainPromise: Promise<void> | null = null;
let drainUnsubscribe: (() => void) | null = null;

export function startDrainTracking(harness: MastraHarness): void {
  drainUnsubscribe?.();
  let resolve!: () => void;
  drainPromise = new Promise<void>((r) => {
    resolve = r;
  });
  drainResolve = resolve;
  drainUnsubscribe = harness.subscribe((event: HarnessEvent) => {
    if (event.type === "agent_end" || event.type === "error") {
      drainUnsubscribe?.();
      drainUnsubscribe = null;
      drainResolve?.();
      drainResolve = null;
      drainPromise = null;
    }
  });
}

export function clearDrainTracking(): void {
  drainUnsubscribe?.();
  drainUnsubscribe = null;
  drainResolve?.();
  drainResolve = null;
  drainPromise = null;
}

/** Wait for the previous harness run to emit agent_end / error before proceeding. */
export async function drainHarness(timeoutMs = 5000): Promise<void> {
  if (!drainPromise) return;
  await Promise.race([
    drainPromise,
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ]);
}
