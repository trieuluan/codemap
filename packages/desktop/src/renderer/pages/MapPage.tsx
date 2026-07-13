import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { CodeMapPanel } from "../components/CodeMapPanel.js";
import { MapFileSidebar } from "../components/MapFileSidebar.js";
import { useSidebarResize } from "../hooks/useSidebarResize.js";

interface MapPageProps {
  workspacePath: string;
}

export function MapPage({ workspacePath: _workspacePath }: MapPageProps) {
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { clampedWidth: leftWidth, startResize: startLeftResize } = useSidebarResize(true);

  useEffect(() => {
    const handler = (e: Event) => setSelectedPath((e as CustomEvent<{ path: string }>).detail.path);
    window.addEventListener("codemap-selected-node", handler);
    return () => window.removeEventListener("codemap-selected-node", handler);
  }, []);

  const handleSelectFile = useCallback((filePath: string) => {
    setSelectedPath(filePath);
    setFocusedPath(filePath);
  }, []);

  return (
    <div
      className="map-workspace"
      style={
        {
          "--sidebar-width": `${leftWidth}px`,
        } as React.CSSProperties
      }
    >
      <MapFileSidebar onSelectFile={handleSelectFile} selectedPath={selectedPath} searchQuery={searchQuery} />

      <div className="map-workspace-resize-handle" onPointerDown={startLeftResize} />

      <div className="map-workspace-main">
        <ReactFlowProvider>
          <CodeMapPanel
            focusedPath={focusedPath}
            searchQuery={searchQuery}
            onSearchQuery={setSearchQuery}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
