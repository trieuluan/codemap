/**
 * Thread management — list, switch, messages, auto-resume.
 *
 * Extracted from harness-runtime.ts to keep each module focused on one domain.
 */
import type { HarnessMessage, HarnessThread } from "../events.js";
import {
  getSingleton,
  setPendingNewThread,
} from "./lifecycle.js";

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
    return await singleton.harness.listThreads();
  } catch {
    return [];
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

export async function switchMastraThread(threadId: string): Promise<boolean> {
  const singleton = getSingleton();
  if (!singleton) return false;
  try {
    await singleton.harness.switchThread({ threadId });
    setPendingNewThread(false);
    return true;
  } catch {
    return false;
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

    await singleton.harness.switchThread({ threadId: latest.id });
    setPendingNewThread(false);
    return latest.id;
  } catch {
    return null;
  }
}
