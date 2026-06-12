import type { EventBus } from "@codemap-ai/core/agent";
import type { Store } from "../../state/store-class.js";
import type { DebugLogger } from "@codemap-ai/runtime-node/utils";

export interface TaskManagerContext {
  store: Store;
  bus: EventBus;
  logger: DebugLogger | null;
}

export interface TaskManagerState {
  taskSeq: number;
  activeTaskId: number;
  taskAbort: AbortController | null;
}

export function createTaskManagerState(): TaskManagerState {
  return { taskSeq: 0, activeTaskId: 0, taskAbort: null };
}

export function beginTask(
  state: TaskManagerState,
  controller: AbortController,
): number {
  const taskId = ++state.taskSeq;
  state.activeTaskId = taskId;
  state.taskAbort = controller;
  return taskId;
}

export function finishTask(
  ctx: TaskManagerContext,
  state: TaskManagerState,
  taskId: number,
): void {
  if (state.activeTaskId !== taskId) return;
  state.activeTaskId = 0;
  state.taskAbort = null;
  ctx.store.dispatch((prev) => ({ input: { ...prev.input, busy: false } }));
}

export function isActiveTask(
  state: TaskManagerState,
  taskId: number,
  controller: AbortController,
): boolean {
  return (
    state.activeTaskId === taskId &&
    state.taskAbort === controller &&
    !controller.signal.aborted
  );
}
