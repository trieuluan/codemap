import { deepMerge } from "./deep-merge.ts";

export type StateUpdater<TState extends object> = (
  prev: TState,
) => Partial<TState>;

export interface StateStoreOptions {
  notify?: () => void;
}

export class StateStore<TState extends object> {
  private state: TState;
  private dirty = false;
  private readonly notify?: () => void;

  constructor(initialState: TState, options: StateStoreOptions = {}) {
    this.state = initialState;
    this.notify = options.notify;
  }

  getState(): Readonly<TState> {
    return this.state;
  }

  dispatch(partial: Partial<TState> | StateUpdater<TState>): void {
    if (typeof partial === "function") {
      partial = partial(this.state);
    }
    this.state = deepMerge(this.state, partial);
    if (!this.dirty) {
      this.dirty = true;
      queueMicrotask(() => {
        this.dirty = false;
        this.notify?.();
      });
    }
  }

  dispatchImmediate(partial: Partial<TState>): void {
    this.state = deepMerge(this.state, partial);
    this.notify?.();
  }
}
