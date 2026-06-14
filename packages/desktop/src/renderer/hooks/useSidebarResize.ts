import { useEffect, useRef, useState } from "react";

const MIN_WIDTH = 220;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;

export function useSidebarResize(sidebarOpen: boolean) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  const clampedWidth = Math.max(MIN_WIDTH, Math.min(sidebarWidth, MAX_WIDTH));

  useEffect(() => {
    if (!sidebarOpen) return;

    function handlePointerMove(event: PointerEvent) {
      if (!resizeState.current) return;
      const next =
        resizeState.current.startWidth + event.clientX - resizeState.current.startX;
      setSidebarWidth(Math.max(MIN_WIDTH, Math.min(next, MAX_WIDTH)));
    }

    function handlePointerUp() {
      resizeState.current = null;
      document.body.classList.remove("sidebar-resizing");
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("sidebar-resizing");
    };
  }, [sidebarOpen]);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    resizeState.current = { startX: event.clientX, startWidth: clampedWidth };
    document.body.classList.add("sidebar-resizing");
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  return { sidebarWidth, clampedWidth, startResize };
}
