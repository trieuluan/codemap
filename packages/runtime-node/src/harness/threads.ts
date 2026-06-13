/**
 * Thread management — list, switch, messages, auto-resume.
 *
 * Pure UI-agnostic module: depends only on lifecycle singleton accessors.
 */
import type { HarnessMessage, HarnessThread } from "../events.ts";
import {
  getSingleton,
  setPendingNewThread,
} from "./lifecycle.ts";

const deletedThreadIds = new Set<string>();

function filterDeletedThreads(threads: HarnessThread[]): HarnessThread[] {
  return threads.filter((thread) => !deletedThreadIds.has(thread.id));
}

export function isMastraThreadAlreadyActive(
  currentThreadId: string | null | undefined,
  targetThreadId: string,
): boolean {
  return currentThreadId === targetThreadId;
}

// ── Thread operations ──────────────────────────────────────────────────

export async function getMastraMessages(
  limit?: number,
): Promise<HarnessMessage[]> {
  const singleton = getSingleton();
  if (!singleton) return [];
  try {
    return await singleton.harness.listMessages({ limit });
  } catch {
    return [];
  }
}

export async function listMastraThreads(): Promise<HarnessThread[]> {
  const singleton = getSingleton();
  if (!singleton) return [];
  try {
    return filterDeletedThreads(await singleton.harness.listThreads());
  } catch {
    return [];
  }
}

export async function deleteMastraThread(threadId: string): Promise<void> {
  const singleton = getSingleton();
  if (!singleton) return;
  deletedThreadIds.add(threadId);
  try {
    await (singleton.harness as any).deleteThread?.({ threadId });
  } catch (error) {
    deletedThreadIds.delete(threadId);
    throw error;
  }

  const currentThreadId = singleton.harness.getCurrentThreadId?.();
  if (isMastraThreadAlreadyActive(currentThreadId, threadId)) {
    setPendingNewThread(true);
  }
}

export async function listMastraThreadMessages(
  threadId: string,
  limit?: number,
): Promise<HarnessMessage[]> {
  const singleton = getSingleton();
  if (!singleton) return [];
  try {
    return await singleton.harness.listMessagesForThread({ threadId, limit });
  } catch {
    return [];
  }
}

export type SwitchMastraThreadResult =
  | { ok: true }
  | { ok: false; message?: string };

export async function switchMastraThread(
  threadId: string,
): Promise<SwitchMastraThreadResult> {
  const singleton = getSingleton();
  if (!singleton) return { ok: false, message: "Mastra harness chưa sẵn sàng." };

  const currentThreadId = singleton.harness.getCurrentThreadId?.();
  if (isMastraThreadAlreadyActive(currentThreadId, threadId)) {
    setPendingNewThread(false);
    return { ok: true };
  }

  try {
    await singleton.harness.switchThread({ threadId });
    setPendingNewThread(false);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : undefined,
    };
  }
}

const AUTO_RESUME_MAX_AGE_DAYS = 7;

/**
 * Auto-resume the latest workspace thread if it's recent enough.
 * Returns the resumed thread ID, or null if starting fresh.
 */
export async function autoResumeLatestThread(): Promise<string | null> {
  const singleton = getSingleton();
  if (!singleton) return null;
  try {
    const threads = await singleton.harness.listThreads();
    if (!threads.length) return null;

    const sorted = [...threads].sort(
      (a, b) =>
        new Date(b.updatedAt ?? 0).getTime() -
        new Date(a.updatedAt ?? 0).getTime(),
    );
    const latest = sorted[0]!;
    const updatedAt = new Date(latest.updatedAt ?? 0).getTime();
    const maxAge = AUTO_RESUME_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    if (Date.now() - updatedAt > maxAge) {
      return null;
    }

    const currentThreadId = singleton.harness.getCurrentThreadId?.();
    if (isMastraThreadAlreadyActive(currentThreadId, latest.id)) {
      setPendingNewThread(false);
      return latest.id;
    }

    await singleton.harness.switchThread({ threadId: latest.id });
    setPendingNewThread(false);
    return latest.id;
  } catch {
    return null;
  }
}
