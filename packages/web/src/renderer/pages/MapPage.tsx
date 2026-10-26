import { useCallback, useEffect, useState } from "react";
import { CodeMapPanel } from "../components/CodeMapPanel.js";
import { MapFileSidebar } from "../components/MapFileSidebar.js";
import { useSidebarResize } from "../hooks/useSidebarResize.js";

import type { GraphFilters } from "../components/graph-view.js";

interface MapPageProps {
  filters?: GraphFilters;
  onFiltersChange?: (filters: GraphFilters) => void;
  workspacePath: string;
  sidebarOpen?: boolean;
  active: boolean;
  externalSidebar?: boolean;
  externalQuery?: string;
}

export function MapPage({ workspacePath: _workspacePath, sidebarOpen = true, active, externalSidebar = false, externalQuery, filters, onFiltersChange }: MapPageProps) {
  const [focusRequest, setFocusRequest] = useState(0);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { clampedWidth: leftWidth, startResize: startLeftResize } = useSidebarResize(true);

  useEffect(() => {
    const handler = (e: Event) => setSelectedPath((e as CustomEvent<{ path: string }>).detail.path);
    window.addEventListener("codemap-selected-node", handler);
    return () => window.removeEventListener("codemap-selected-node", handler);
  }, []);

  useEffect(() => {
    const select = (event: Event) => {
      const path = (event as CustomEvent<{ path: string }>).detail.path;
      setSelectedPath(path);
      setFocusedPath(path);
      setFocusRequest(value => value + 1);
    };
    window.addEventListener("codemap-focus-file", select);
    return () => window.removeEventListener("codemap-focus-file", select);
  }, []);
  useEffect(() => { if (externalQuery !== undefined) setSearchQuery(externalQuery); }, [externalQuery]);

  const handleSelectFile = useCallback((filePath: string) => {
    setSelectedPath(filePath);
    setFocusedPath(filePath);
    setFocusRequest(value => value + 1);
  }, []);

  return (
    <div
      className={`map-workspace ${sidebarOpen ? "" : "web-map-sidebar-closed"}`}
      style={
        {
          "--sidebar-width": `${leftWidth}px`,
        } as React.CSSProperties
      }
    >
      {sidebarOpen && !externalSidebar && <MapFileSidebar onSelectFile={handleSelectFile} selectedPath={selectedPath} searchQuery={searchQuery} />}

      {sidebarOpen && !externalSidebar && <div className="map-workspace-resize-handle" onPointerDown={startLeftResize} />}

      <div className="map-workspace-main">
        <CodeMapPanel
          active={active}
          focusedPath={focusedPath}
          searchQuery={searchQuery}
          focusRequest={focusRequest}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </div>
    </div>
  );
}
