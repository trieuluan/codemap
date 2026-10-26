"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible.js";
import { Badge } from "../ui/badge.js";
import { cn } from "../../lib/utils.js";
import {
  ChevronDownIcon,
  ListChecks,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

// ── Task data types ─────────────────────────────────────────

export interface TaskItemData {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

// ── Status helpers ───────────────────────────────────────────

const STATUS_CHIPS: Record<TaskItemData["status"], { label: string; icon: ReactNode; className: string }> = {
  pending:    { label: "Pending",     icon: <Circle className="size-3" />,         className: "text-muted-foreground" },
  in_progress:{ label: "In Progress", icon: <Loader2 className="size-3 animate-spin" />, className: "text-blue-400" },
  completed:  { label: "Completed",   icon: <CheckCircle2 className="size-3" />,   className: "text-green-400" },
};

// ── Task (collapsible wrapper) ───────────────────────────────

export type TaskProps = ComponentProps<typeof Collapsible>;

export const Task = ({
  defaultOpen = true,
  className,
  ...props
}: TaskProps) => (
  <Collapsible
    className={cn("task-inline not-prose w-full", className)}
    defaultOpen={defaultOpen}
    {...props}
  />
);

// ── TaskTrigger ──────────────────────────────────────────────

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
  count?: number;
};

export const TaskTrigger = ({
  children,
  className,
  title,
  count,
  ...props
}: TaskTriggerProps) => (
  <CollapsibleTrigger asChild className={cn("group", className)} {...props}>
    {children ?? (
      <div className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
        <ListChecks className="size-4" />
        <span className="font-medium text-sm">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="rounded-full text-xs px-1.5">
            {count}
          </Badge>
        )}
        <ChevronDownIcon className="size-4 ml-auto transition-transform group-data-[state=open]:rotate-180" />
      </div>
    )}
  </CollapsibleTrigger>
);

// ── TaskContent ──────────────────────────────────────────────

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({
  children,
  className,
  ...props
}: TaskContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  >
    <div className="mt-2 space-y-1 px-3 pb-2">{children}</div>
  </CollapsibleContent>
);

// ── TaskItem (single task row) ───────────────────────────────

export type TaskItemProps = ComponentProps<"div"> & {
  task: TaskItemData;
};

export const TaskItem = ({
  task,
  className,
  ...props
}: TaskItemProps) => {
  const chip = STATUS_CHIPS[task.status] ?? STATUS_CHIPS.pending;
  const content = task.activeForm ?? task.content;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1.5",
        task.status === "in_progress" && "bg-blue-500/5",
        className
      )}
      {...props}
    >
      <span className={cn("mt-0.5 shrink-0", chip.className)}>
        {chip.icon}
      </span>
      <span
        className={cn(
          "text-sm min-w-0 flex-1",
          task.status === "completed" && "line-through text-muted-foreground"
        )}
      >
        {content}
      </span>
      <Badge
        variant="outline"
        className={cn(
          "rounded-full text-xs px-1.5 shrink-0 border-transparent",
          chip.className
        )}
      >
        {chip.label}
      </Badge>
    </div>
  );
};

// ── TaskList (renders array of TaskItemData) ─────────────────

export type TaskListProps = ComponentProps<"div"> & {
  tasks: TaskItemData[];
};

export const TaskList = ({ tasks, className, ...props }: TaskListProps) => (
  <div className={cn("space-y-0.5", className)} {...props}>
    {tasks.map((task) => (
      <TaskItem key={task.id} task={task} />
    ))}
  </div>
);
