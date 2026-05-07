"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export interface ImportSSEEvent {
  importId: string;
  status: string;
  parseStatus: string | null;
  importProgress: number | null;
  importStage: string | null;
  parseProgress: number | null;
  parseStage: string | null;
}

export function useImportSSE(projectId: string, enabled: boolean) {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource(`/api/events/projects/${projectId}/import`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as ImportSSEEvent;
        // Refresh server component data on every status change
        router.refresh();

        const done =
          data.status === "failed" ||
          (data.status === "completed" &&
            ["completed", "partial", "failed"].includes(data.parseStatus ?? ""));

        if (done) {
          es.close();
          esRef.current = null;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [projectId, enabled, router]);
}
