"use client";

import { useEffect, useRef } from "react";
import { config } from "@/lib/config";

interface SubscriptionSSEOptions {
  enabled: boolean;
  onPlanChanged: (plan: string) => void;
  onTimeout?: () => void;
}

export function useSubscriptionSSE(
  workspaceId: string,
  { enabled, onPlanChanged, onTimeout }: SubscriptionSSEOptions,
) {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !workspaceId) return;

    const es = new EventSource(
      `${config.apiUrl}/events/workspaces/${workspaceId}/subscription`,
      { withCredentials: true },
    );
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as { type: string; plan?: string };

        if (data.type === "plan_changed" && data.plan) {
          onPlanChanged(data.plan);
          es.close();
          esRef.current = null;
        }

        if (data.type === "timeout") {
          onTimeout?.();
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
  }, [workspaceId, enabled, onPlanChanged, onTimeout]);
}
