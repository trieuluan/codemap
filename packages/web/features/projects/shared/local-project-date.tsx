"use client";

import { useEffect, useState } from "react";
import { formatProjectDate } from "./project-helpers";

interface LocalProjectDateProps {
  value?: string | null;
  emptyLabel?: string;
  className?: string;
}

export function LocalProjectDate({
  value,
  emptyLabel = "Not available",
  className,
}: LocalProjectDateProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!value) {
    return <span className={className}>{emptyLabel}</span>;
  }

  const fallbackLabel = formatProjectDate(value, {
    timeZone: "UTC",
  });
  const localLabel = formatProjectDate(value);

  return (
    <time
      dateTime={value}
      className={className}
      suppressHydrationWarning
      title={isMounted ? undefined : "Displayed in UTC until your local timezone loads"}
    >
      {isMounted ? localLabel : fallbackLabel}
    </time>
  );
}
