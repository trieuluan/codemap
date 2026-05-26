type TrackedTool = "get_agent_workflow" | "explore_task";

interface SessionState {
  calledGetAgentWorkflow: boolean;
  calledExploreTask: boolean;
  taskCount: number;
}

class SessionTracker {
  private state: SessionState = {
    calledGetAgentWorkflow: false,
    calledExploreTask: false,
    taskCount: 0,
  };

  markCalled(tool: TrackedTool): void {
    if (tool === "get_agent_workflow") this.state.calledGetAgentWorkflow = true;
    if (tool === "explore_task") this.state.calledExploreTask = true;
  }

  incrementTask(): void {
    this.state.taskCount++;
  }

  getContextScore(): number {
    let score = 0;
    if (this.state.calledGetAgentWorkflow) score += 30;
    if (this.state.calledExploreTask) score += 40;
    return score;
  }

  getWarnings(): string[] {
    const warnings: string[] = [];
    if (!this.state.calledGetAgentWorkflow) {
      warnings.push("get_agent_workflow not called this session — workflow rules may be missing.");
    }
    if (!this.state.calledExploreTask && this.state.taskCount > 0) {
      warnings.push("explore_task not called — editing without full dependency context increases regression risk.");
    }
    return warnings;
  }

  getState(): Readonly<SessionState> {
    return { ...this.state };
  }
}

// Singleton — one per MCP server process (one per session)
export const sessionTracker = new SessionTracker();
