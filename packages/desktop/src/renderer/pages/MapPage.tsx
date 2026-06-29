import { useCallback, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { CodeMapPanel } from "../components/CodeMapPanel.js";
import { MapFileSidebar } from "../components/MapFileSidebar.js";
import { useSidebarResize } from "../hooks/useSidebarResize.js";

interface MapPageProps {
  workspacePath: string;
}

export function MapPage({ workspacePath: _workspacePath }: MapPageProps) {
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const { clampedWidth, startResize } = useSidebarResize(true);
  const handleSelectFile = useCallback((filePath: string) => {
    setFocusedPath(filePath);
  }, []);

  return (
    <div className="map-workspace" style={{ "--sidebar-width": `${clampedWidth}px` } as React.CSSProperties}>
      <MapFileSidebar onSelectFile={handleSelectFile} />

      <div className="map-workspace-resize-handle" onPointerDown={startResize} />

      <div className="map-workspace-main">
        <ReactFlowProvider>
          <CodeMapPanel focusedPath={focusedPath} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
