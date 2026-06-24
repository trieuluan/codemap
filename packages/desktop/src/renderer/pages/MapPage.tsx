import { ReactFlowProvider } from "@xyflow/react";
import { CodeMapPanel } from "../components/CodeMapPanel.js";

export function MapPage() {
  return (
    <div className="map-column">
      <ReactFlowProvider>
        <CodeMapPanel />
      </ReactFlowProvider>
    </div>
  );
}
