"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible.js";
import { Button } from "../ui/button.js";
import { cn } from "../../lib/utils.js";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type PlanProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
};

export const Plan = ({
  className,
  defaultOpen = true,
  isStreaming = false,
  ...props
}: PlanProps) => (
  <Collapsible
    className={cn("codemap-plan not-prose w-full", className)}
    data-streaming={isStreaming ? "true" : "false"}
    defaultOpen={defaultOpen}
    {...props}
  />
);

export type PlanHeaderProps = ComponentProps<"div">;

export const PlanHeader = ({ className, ...props }: PlanHeaderProps) => (
  <div className={cn("codemap-plan-header", className)} {...props} />
);

export type PlanTitleProps = Omit<ComponentProps<"h3">, "children"> & {
  children?: ReactNode;
};

export const PlanTitle = ({ className, children, ...props }: PlanTitleProps) => (
  <h3 className={cn("codemap-plan-title", className)} {...props}>
    {children}
  </h3>
);

export type PlanDescriptionProps = Omit<ComponentProps<"p">, "children"> & {
  children?: ReactNode;
};

export const PlanDescription = ({
  className,
  children,
  ...props
}: PlanDescriptionProps) => (
  <p className={cn("codemap-plan-description", className)} {...props}>
    {children}
  </p>
);

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const PlanTrigger = ({
  className,
  children,
  ...props
}: PlanTriggerProps) => (
  <CollapsibleTrigger asChild className={className} {...props}>
    {children ?? (
      <Button
        className="codemap-plan-trigger"
        size="icon"
        title="Toggle plan"
        type="button"
        variant="ghost"
      >
        <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
      </Button>
    )}
  </CollapsibleTrigger>
);

export type PlanContentProps = ComponentProps<typeof CollapsibleContent>;

export const PlanContent = ({ className, ...props }: PlanContentProps) => (
  <CollapsibleContent
    className={cn(
      "codemap-plan-content data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
);

export type PlanFooterProps = ComponentProps<"div">;

export const PlanFooter = ({ className, ...props }: PlanFooterProps) => (
  <div className={cn("codemap-plan-footer", className)} {...props} />
);

export type PlanActionProps = ComponentProps<"div">;

export const PlanAction = ({ className, ...props }: PlanActionProps) => (
  <div className={cn("codemap-plan-action", className)} {...props} />
);
