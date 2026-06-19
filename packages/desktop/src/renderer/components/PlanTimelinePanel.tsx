import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import type { SessionSnapshot, ToolCallState } from "@codemap-ai/core/agent/contracts";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "./ai-elements/plan.js";
import {
  TaskList,
  type TaskItemData,
} from "./ai-elements/task.js";
import { MessageResponse } from "./ai-elements/message.js";
import { Shimmer } from "./ai-elements/shimmer.js";

interface PlanTimelinePanelProps {
  mode: "plan" | "build";
  onRespondToPlanReview: (
    planReviewId: string,
    action: "apply" | "reject" | "revise",
    feedback?: string,
  ) => void;
  snapshot: SessionSnapshot;
}

const TASK_NAME_RE = /(?:_|^)(task_write|task_update|task_complete)(?:_ide)?$/;

function taskCat(name: string): "write" | "update" | "complete" | null {
  const m = name.match(TASK_NAME_RE);
  if (!m) return null;
  if (m[1] === "task_write") return "write";
  if (m[1] === "task_update") return "update";
  return "complete";
}

function isValidStatus(s: unknown): s is TaskItemData["status"] {
  return s === "pending" || s === "in_progress" || s === "completed";
}

export function aggregateTasks(tools: ToolCallState[]): TaskItemData[] {
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

export function PlanTimelinePanel({
  mode,
  onRespondToPlanReview,
  snapshot,
}: PlanTimelinePanelProps) {
  const [isRevising, setIsRevising] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const tasks = useMemo(() => aggregateTasks(snapshot.tools), [snapshot.tools]);

  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;

  const nonTaskTools = useMemo(
    () => snapshot.tools.filter((t) => !taskCat(t.name)).slice(-5).reverse(),
    [snapshot.tools],
  );

  const hasTasks = tasks.length > 0;
  const pendingPlan = snapshot.pendingPlanReview;
  const inProgress = tasks.find((t) => t.status === "in_progress");
  const isRunning = snapshot.status === "running";
  const isPlanStreaming = mode === "plan" && isRunning && !hasTasks && !pendingPlan;
  const title = pendingPlan?.title ?? (mode === "plan" ? "Planning" : "Build plan");
  const statusText = snapshot.status === "running"
    ? (inProgress ? `Working on: ${inProgress.activeForm ?? inProgress.content}` : "Running…")
    : snapshot.status;
  const description = pendingPlan
    ? "Review the plan, then build or ask for changes."
    : hasTasks
    ? statusText
    : "Tasks appear when the agent writes an execution plan.";

  function submitRevision() {
    const feedback = revisionFeedback.trim();
    if (!pendingPlan || !feedback) return;
    onRespondToPlanReview(pendingPlan.planReviewId, "revise", feedback);
    setRevisionFeedback("");
    setIsRevising(false);
  }

  return (
    <section className="plan-panel" aria-label="Plan timeline">
      <div className="plan-panel-scroll">
        <Plan defaultOpen isStreaming={isPlanStreaming}>
          <PlanHeader>
            <div className="codemap-plan-heading">
              <span className={`xp-dot ${snapshot.status}`} />
              <div>
                <PlanTitle>
                  {isPlanStreaming ? (
                    <Shimmer as="span" duration={1.4}>Preparing plan...</Shimmer>
                  ) : title}
                </PlanTitle>
                <PlanDescription>
                  {isPlanStreaming ? (
                    <Shimmer as="span" duration={1.8}>Waiting for the agent to write tasks</Shimmer>
                  ) : description}
                </PlanDescription>
              </div>
            </div>
            <PlanAction>
              {hasTasks && (
                <span className="plan-progress">
                  {completed}/{total}
                </span>
              )}
              <PlanTrigger />
            </PlanAction>
          </PlanHeader>

          <PlanContent>
            {pendingPlan ? (
              <div className="codemap-plan-review">
                <MessageResponse isStreaming={false}>
                  {pendingPlan.plan}
                </MessageResponse>
              </div>
            ) : hasTasks ? (
              <TaskList tasks={tasks} />
            ) : (
              <div className="codemap-plan-empty">
                <Circle className="size-7 opacity-30" />
                <div>
                  <p>No tasks yet.</p>
                  <p>
                    The checklist will appear after{" "}
                    <code>task_write</code>.
                  </p>
                </div>
              </div>
            )}
          </PlanContent>

          <PlanFooter>
            {pendingPlan ? (
              <div className="plan-review-dock">
                {isRevising ? (
                  <div className="plan-review-revise">
                    <textarea
                      autoFocus
                      placeholder="Describe what to change in the plan..."
                      value={revisionFeedback}
                      onChange={(event) => setRevisionFeedback(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                          event.preventDefault();
                          submitRevision();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setIsRevising(false);
                        }
                      }}
                    />
                    <div className="plan-review-actions">
                      <button
                        className="plan-review-button primary"
                        disabled={!revisionFeedback.trim()}
                        onClick={submitRevision}
                        type="button"
                      >
                        Send revision
                      </button>
                      <button
                        className="plan-review-button"
                        onClick={() => setIsRevising(false)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="plan-review-actions">
                    <button
                      className="plan-review-button primary"
                      onClick={() => onRespondToPlanReview(pendingPlan.planReviewId, "apply")}
                      type="button"
                    >
                      Build
                    </button>
                    <button
                      className="plan-review-button"
                      onClick={() => setIsRevising(true)}
                      type="button"
                    >
                      Revise
                    </button>
                    <button
                      className="plan-review-button danger"
                      onClick={() => onRespondToPlanReview(
                        pendingPlan.planReviewId,
                        "reject",
                        "Plan rejected by user.",
                      )}
                      type="button"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <span>{mode === "plan" ? "Plan mode" : "Build mode"}</span>
                <span>{snapshot.status}</span>
              </>
            )}
          </PlanFooter>
        </Plan>

        <div className="plan-activity">
          <header className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
            <p className="plan-activity-empty">
              No tool activity yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
