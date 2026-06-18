import { useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import type { SessionSnapshot, ToolCallState } from "@codemap-ai/core/agent/contracts";
import {
  Task,
  TaskTrigger,
  TaskContent,
  TaskList,
  type TaskItemData,
} from "./ai-elements/task.js";

interface PlanTimelinePanelProps {
  mode: "plan" | "build";
  snapshot: SessionSnapshot;
}

const TASK_NAME_RE = /(?:_|^)(task_write|task_update|task_complete)(?:_ide)?$/;

function taskCat(name: string): "write" | "update" | "complete" | null {
  const m = name.match(TASK_NAME_RE);
  if (!m) return null;
  return m[1] as "write" | "update" | "complete";
}

function isValidStatus(s: unknown): s is TaskItemData["status"] {
  return s === "pending" || s === "in_progress" || s === "completed";
}

function aggregateTasks(tools: ToolCallState[]): TaskItemData[] {
  const map = new Map<string, TaskItemData>();

  for (const tool of tools) {
    const cat = taskCat(tool.name);
    if (!cat) continue;

    let args: Record<string, unknown> | null = null;
    if (tool.args) {
      try { args = JSON.parse(tool.args); } catch { /* skip malformed */ }
    }
    if (!args || typeof args !== "object") continue;

    if (cat === "write") {
      const tasks = args.tasks;
      if (!Array.isArray(tasks)) continue;
      for (const t of tasks) {
        if (!t || typeof t !== "object") continue;
        const r = t as Record<string, unknown>;
        if (typeof r.id === "string" && typeof r.content === "string") {
          map.set(r.id, {
            id: r.id,
            content: r.content,
            status: isValidStatus(r.status) ? r.status : "pending",
            activeForm: typeof r.activeForm === "string" ? r.activeForm : undefined,
          });
        }
      }
    } else if (cat === "update") {
      const id = typeof args.id === "string" ? args.id : null;
      if (!id) continue;
      const existing = map.get(id);
      if (existing) {
        if (typeof args.content === "string") existing.content = args.content;
        if (isValidStatus(args.status)) existing.status = args.status;
        if (typeof args.activeForm === "string") existing.activeForm = args.activeForm;
      }
    } else if (cat === "complete") {
      const id = typeof args.id === "string" ? args.id : null;
      if (!id) continue;
      const existing = map.get(id);
      if (existing) existing.status = "completed";
    }
  }

  return Array.from(map.values());
}

export function PlanTimelinePanel({ mode, snapshot }: PlanTimelinePanelProps) {
  const tasks = useMemo(() => aggregateTasks(snapshot.tools), [snapshot.tools]);

  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;

  const nonTaskTools = useMemo(
    () => snapshot.tools.filter((t) => !taskCat(t.name)).slice(-5).reverse(),
    [snapshot.tools],
  );

  const hasTasks = tasks.length > 0;
  const inProgress = tasks.find((t) => t.status === "in_progress");
  const statusText = snapshot.status === "running"
    ? (inProgress ? `Working on: ${inProgress.activeForm ?? inProgress.content}` : "Running…")
    : snapshot.status;

  return (
    <section className="plan-panel" aria-label="Plan timeline">
      <header className="xp-panel-head">
        <div className="xp-head-title">
          <span className={`xp-dot ${snapshot.status}`} />
          <div>
            <strong>Tasks</strong>
            <span className="xp-head-sub">
              {mode === "plan" ? "Plan mode" : "Build mode"} · {statusText}
            </span>
          </div>
        </div>
        {hasTasks && (
          <span className="plan-progress">
            {completed}/{total} completed
          </span>
        )}
      </header>

      {hasTasks ? (
        <Task defaultOpen className="task-plan">
          <TaskTrigger title="Current tasks" count={total} />
          <TaskContent>
            <TaskList tasks={tasks} />
          </TaskContent>
        </Task>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          <Circle className="mx-auto mb-2 size-8 opacity-30" />
          <p>No tasks yet.</p>
          <p className="mt-1 text-xs">
            Tasks appear when the agent calls{" "}
            <code className="text-[11px]">task_write</code>.
          </p>
        </div>
      )}

      <div className="plan-activity">
        <header className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Activity size={13} />
          <span>Recent activity</span>
        </header>
        {nonTaskTools.length > 0 ? nonTaskTools.map((tool) => (
          <div className="plan-activity-row" key={tool.toolCallId}>
            <code>{tool.name}</code>
            <small>
              {tool.isError ? (
                <span className="text-red-400">error</span>
              ) : tool.result !== undefined ? (
                <CheckCircle2 size={12} className="text-green-400" />
              ) : (
                <Loader2 size={12} className="animate-spin text-blue-400" />
              )}
            </small>
          </div>
        )) : (
          <p className="px-4 py-2 text-xs text-muted-foreground">
            No tool activity yet.
          </p>
        )}
      </div>
    </section>
  );
}
