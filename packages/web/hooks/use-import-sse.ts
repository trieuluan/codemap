"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { config } from "@/lib/config";

export interface ImportSSEEvent {
  importId: string;
  status: string;
  parseStatus: string | null;
  importProgress: number | null;
  importStage: string | null;
  parseProgress: number | null;
  parseStage: string | null;
}

interface UseImportSSEOptions {
  enabled: boolean;
  // Called on every SSE event — use to mutate SWR caches in client components.
  // If omitted, falls back to router.refresh() for server component pages.
  onUpdate?: (event: ImportSSEEvent) => void;
  onDone?: (event: ImportSSEEvent) => void;
}

export function useImportSSE(projectId: string, options: UseImportSSEOptions | boolean) {
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);

  const enabled = typeof options === "boolean" ? options : options.enabled;
  const onUpdate = typeof options === "object" ? options.onUpdate : undefined;
  const onDone = typeof options === "object" ? options.onDone : undefined;

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource(`${config.apiUrl}/events/projects/${projectId}/import`, {
      withCredentials: true,
    });
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as ImportSSEEvent;

        if (onUpdate) {
          onUpdate(data);
        } else {
          router.refresh();
        }

        const done =
          data.status === "failed" ||
          (data.status === "completed" &&
            ["completed", "partial", "failed"].includes(data.parseStatus ?? ""));

        if (done) {
          onDone?.(data);
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
  }, [projectId, enabled, onUpdate, onDone, router]);
}
