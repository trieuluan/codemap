import type { EventBus } from "@codemap-ai/core/agent";
import { StateStore, type StateUpdater } from "@codemap-ai/core/lib/state-store.js";
import type { UIState } from "./types.js";

export type { StateUpdater };

export class Store extends StateStore<UIState> {
  constructor(initialState: UIState, bus: EventBus) {
    super(initialState, {
      notify: () => {
        bus.emit({ type: "screen:refresh" });
      },
    });
  }
}
