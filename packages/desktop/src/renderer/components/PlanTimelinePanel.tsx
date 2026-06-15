import {
  Check,
  Circle,
  LoaderCircle,
} from "lucide-react";
import type { SessionSnapshot } from "@codemap-ai/core/agent/contracts";

interface PlanTimelinePanelProps {
  mode: "plan" | "build";
  snapshot: SessionSnapshot;
}

type PhaseState = "done" | "active" | "pending";

const readPattern = /(read|search|find|symbol|explore|get_file)/i;
const editPattern = /(apply_patch|edit|write|create)/i;
const verifyPattern = /(test|build|verify|lint|check)/i;

function phaseState(snapshot: SessionSnapshot, pattern: RegExp, priorComplete: boolean): PhaseState {
  const matching = snapshot.tools.filter((tool) => pattern.test(tool.name));
  if (matching.some((tool) => tool.result !== undefined || tool.isError)) return "done";
  if (matching.length > 0 || (priorComplete && snapshot.status === "running")) return "active";
  return "pending";
}

export function PlanTimelinePanel({ mode, snapshot }: PlanTimelinePanelProps) {
  const orientState: PhaseState = snapshot.tools.length > 0
    ? "done"
    : snapshot.status === "running" ? "active" : "pending";
  const readState = phaseState(snapshot, readPattern, orientState === "done");
  const editState = phaseState(snapshot, editPattern, readState === "done");
  const verifyState = phaseState(snapshot, verifyPattern, editState === "done");
  const recentTools = snapshot.tools.slice(-4).reverse();
  const phases = [
    {
      title: "Orient",
      detail: "Understand the repository and task boundaries.",
      steps: ["Map the workspace", "Identify ownership boundaries"],
      state: orientState,
    },
    {
      title: "Read",
      detail: "Inspect the relevant files, symbols, and dependencies.",
      steps: ["Rank relevant files", "Trace symbols and dependencies"],
      state: readState,
    },
    {
      title: "Edit",
      detail: "Implement the approved desktop UI changes.",
      steps: ["Apply scoped changes", "Preserve runtime contracts"],
      state: editState,
    },
    {
      title: "Verify",
      detail: "Build, test, and inspect the finished experience.",
      steps: ["Run focused checks", "Inspect the final diff"],
      state: verifyState,
    },
  ];
  const completedPhases = phases.filter((phase) => phase.state === "done").length;

  return (
    <section className="plan-panel" aria-label="Plan timeline">
      <header className="xp-panel-head">
        <div className="xp-head-title">
          <span className={`xp-dot ${snapshot.status}`} />
          <div>
            <strong>Execution plan</strong>
            <span className="xp-head-sub">
              {mode === "plan" ? "Plan mode" : "Build mode"} · {snapshot.status}
            </span>
          </div>
        </div>
        <span className="plan-progress">
          {completedPhases}/{phases.length} phases
        </span>
      </header>

      <div className="plan-timeline">
        {phases.map((phase, index) => (
          <article className={`plan-phase ${phase.state}`} key={phase.title}>
            <div className="plan-rail">
              <span className="plan-node">
                {phase.state === "done" ? (
                  <Check size={13} />
                ) : phase.state === "active" ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <Circle size={8} />
                )}
              </span>
              {index < phases.length - 1 ? <span className="plan-line" /> : null}
            </div>
            <div className="plan-content">
              <div className="plan-phase-head">
                <strong>{phase.title}</strong>
                <span className={`plan-status-chip ${phase.state}`}>
                  {phase.state}
                </span>
              </div>
              <p className="plan-note">{phase.detail}</p>
              <div className="plan-steps">
                {phase.steps.map((step, stepIndex) => {
                  const stepDone = phase.state === "done";
                  const stepActive = phase.state === "active" && stepIndex === 0;
                  return (
                    <div
                      className={`plan-step${stepDone ? " done" : ""}${stepActive ? " active" : ""}`}
                      key={step}
                    >
                      {stepDone ? (
                        <Check size={12} />
                      ) : stepActive ? (
                        <LoaderCircle size={12} />
                      ) : (
                        <Circle size={7} />
                      )}
                      <span>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="plan-activity">
        <span>Recent activity</span>
        {recentTools.length > 0 ? recentTools.map((tool) => (
          <div className="plan-activity-row" key={tool.toolCallId}>
            <code>{tool.name}</code>
            <small>{tool.isError ? "error" : tool.result !== undefined ? "done" : "running"}</small>
          </div>
        )) : <p>No tool activity yet.</p>}
      </div>
    </section>
  );
}
