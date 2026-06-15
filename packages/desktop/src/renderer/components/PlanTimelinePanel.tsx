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
    { title: "Orient", detail: "Understand the repository and task boundaries.", state: orientState },
    { title: "Read", detail: "Inspect the relevant files, symbols, and dependencies.", state: readState },
    { title: "Edit", detail: "Implement the approved desktop UI changes.", state: editState },
    { title: "Verify", detail: "Build, test, and inspect the finished experience.", state: verifyState },
  ];

  return (
    <section className="flex flex-col min-h-0 p-4 overflow-y-auto" aria-label="Plan timeline">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Execution plan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{mode === "plan" ? "Planning mode" : "Build mode"} · {snapshot.status}</p>
        </div>
        <span className={`xp-status ${snapshot.status}`}>{snapshot.status}</span>
      </header>

      <div className="grid gap-0">
        {phases.map((phase, index) => (
          <article className={`plan-step ${phase.state}`} key={phase.title}>
            <div className="plan-marker"><span>{phase.state === "done" ? "✓" : index + 1}</span></div>
            <div><strong>{phase.title}</strong><p>{phase.detail}</p></div>
          </article>
        ))}
      </div>

      <div className="mt-4 pt-4 plan-activity">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recent activity</span>
        {recentTools.length > 0 ? recentTools.map((tool) => (
          <div className="flex items-center justify-between py-1.5 text-xs" key={tool.toolCallId}>
            <code className="font-mono text-foreground">{tool.name}</code>
            <small className="text-muted-foreground">{tool.isError ? "error" : tool.result !== undefined ? "done" : "running"}</small>
          </div>
        )) : <p>No tool activity yet.</p>}
      </div>
    </section>
  );
}
