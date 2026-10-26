"use client";

import { cn } from "../../lib/utils.js";
import type { ComponentProps } from "react";

export type StreamingIndicatorProps = ComponentProps<"div">;

export const StreamingIndicator = ({
  className,
  ...props
}: StreamingIndicatorProps) => (
  <div className={cn("streaming-indicator", className)} {...props}>
    <span className="streaming-dot" />
    <span className="streaming-dot" />
    <span className="streaming-dot" />
  </div>
);
