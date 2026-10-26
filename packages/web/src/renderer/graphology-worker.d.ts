// graphology-layout-forceatlas2 ships CJS with no `exports` map, so NodeNext can't
// resolve the `/worker` subpath's typings on its own. Declare the supervisor here.
declare module "graphology-layout-forceatlas2/worker" {
  import type Graph from "graphology-types";
  export interface FA2SupervisorParameters {
    settings?: Record<string, unknown>;
    getEdgeWeight?: string | null;
    outputReducer?: (key: string, attributes: Record<string, unknown>) => Record<string, unknown>;
  }
  export default class FA2LayoutSupervisor {
    constructor(graph: Graph, params?: FA2SupervisorParameters);
    /** Sent to the worker with every iteration request, so it can be changed while running. */
    settings: Record<string, unknown>;
    isRunning(): boolean;
    start(): void;
    stop(): void;
    kill(): void;
  }
}
