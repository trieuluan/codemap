// ─── Typed UI Events ─────────────────────────────────────

export type UIEvent =
  | { type: "agent:start"; model: string }
  | { type: "agent:token"; text: string }
  | { type: "agent:thinking"; elapsed: number }
  | { type: "agent:done"; usage: UsageStats }
  | { type: "agent:error"; message: string }
  | { type: "tool:start"; name: string; args: string; id: string }
  | { type: "tool:log"; id: string; chunk: string }
  | { type: "tool:end"; id: string; result: string }
  | { type: "tool:error"; id: string; message: string }
  | { type: "tool:confirm"; name: string; preview: string | null }
  | { type: "diff:generated"; file: string; patch: string }
  | { type: "subprocess:start"; command: string; id: string }
  | { type: "subprocess:stdout"; id: string; chunk: string }
  | { type: "subprocess:stderr"; id: string; chunk: string }
  | { type: "subprocess:exit"; id: string; code: number }
  | { type: "status:update"; phase: TaskPhase }
  | { type: "input:submit"; text: string }
  | { type: "input:abort" }
  | { type: "screen:refresh" }
  | { type: "screen:resize"; width: number; height: number };

export type UIEventType = UIEvent["type"];

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type TaskPhase = "idle" | "thinking" | "tool" | "streaming" | "done" | "classifying" | "planning" | "executing" | "reviewing";

type Listener<T extends UIEvent = UIEvent> = (event: T) => void;

// ─── Event Bus ───────────────────────────────────────────

export class EventBus {
  private listeners = new Map<UIEventType, Set<Listener>>();
  private anyListeners = new Set<Listener>();
  private refreshScheduled = false;

  on<T extends UIEvent>(type: T["type"], listener: (event: T) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener);
    return () => set!.delete(listener as Listener);
  }

  onAny(listener: Listener): () => void {
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }

  emit(event: UIEvent): void {
    // Fan out to type-specific listeners
    const set = this.listeners.get(event.type);
    if (set) {
      for (const fn of set) fn(event);
    }

    // Fan out to catch-all listeners
    for (const fn of this.anyListeners) fn(event);
  }

  /**
   * Schedule a single screen:refresh on the next microtask.
   * Multiple calls in the same tick coalesce into one refresh.
   */
  scheduleRefresh(): void {
    if (this.refreshScheduled) return;
    this.refreshScheduled = true;
    queueMicrotask(() => {
      this.refreshScheduled = false;
      this.emit({ type: "screen:refresh" });
    });
  }

  removeAll(): void {
    this.listeners.clear();
    this.anyListeners.clear();
  }
}
