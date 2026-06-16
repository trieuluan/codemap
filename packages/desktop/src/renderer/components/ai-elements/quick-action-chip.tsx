"use client";

import { cn } from "../../lib/utils.js";
import type { ComponentProps } from "react";

export type QuickActionChipProps = ComponentProps<"button"> & {
  label: string;
};

export const QuickActionChip = ({
  label,
  className,
  ...props
}: QuickActionChipProps) => (
  <button
    className={cn("quick-action-chip", className)}
    type="button"
    {...props}
  >
    {label}
  </button>
);
