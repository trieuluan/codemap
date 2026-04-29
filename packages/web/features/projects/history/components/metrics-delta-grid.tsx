"use client";

import { ArrowDown, ArrowRight, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MetricDelta } from "../types";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function DeltaArrow({ delta }: { delta: number }) {
  if (delta === 0) return <Minus className="size-3.5" />;
  return delta > 0 ? (
    <ArrowUp className="size-3.5" />
  ) : (
    <ArrowDown className="size-3.5" />
  );
}

export function MetricsDeltaGrid({ metrics }: { metrics: MetricDelta[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {metrics.map((metric) => {
        const positive = metric.delta > 0;
        const negative = metric.delta < 0;
        const pct = metric.base > 0 ? (metric.delta / metric.base) * 100 : 0;

        return (
          <div
            key={metric.label}
            className="rounded-lg border bg-card p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {metric.label}
            </p>
            <div className="mt-2 flex items-baseline gap-2 text-sm tabular-nums text-muted-foreground">
              <span>{formatNumber(metric.base)}</span>
              <ArrowRight className="size-3.5" />
              <span className="text-base font-semibold text-foreground">
                {formatNumber(metric.head)}
              </span>
            </div>
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                positive && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                negative && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                metric.delta === 0 && "bg-muted text-muted-foreground",
              )}
            >
              <DeltaArrow delta={metric.delta} />
              {metric.delta > 0 ? "+" : ""}
              {formatNumber(metric.delta)}
              {metric.base > 0 ? (
                <span className="opacity-70">
                  ({pct > 0 ? "+" : ""}
                  {pct.toFixed(1)}%)
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
