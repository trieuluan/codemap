import { useEffect, useRef, useState } from "react";

const MIN_WIDTH = 360;
const MAX_WIDTH = 760;
const DEFAULT_WIDTH = 500;

export function useInspectorResize(inspectorOpen: boolean) {
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_WIDTH);
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  const clampedWidth = Math.max(MIN_WIDTH, Math.min(inspectorWidth, MAX_WIDTH));

  useEffect(() => {
    if (!inspectorOpen) return;

    function handlePointerMove(event: PointerEvent) {
      if (!resizeState.current) return;
      const next =
        resizeState.current.startWidth - (event.clientX - resizeState.current.startX);
      setInspectorWidth(Math.max(MIN_WIDTH, Math.min(next, MAX_WIDTH)));
    }

    function handlePointerUp() {
      resizeState.current = null;
      document.body.classList.remove("inspector-resizing");
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("inspector-resizing");
    };
  }, [inspectorOpen]);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    resizeState.current = { startX: event.clientX, startWidth: clampedWidth };
    document.body.classList.add("inspector-resizing");
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  return { inspectorWidth, clampedWidth, startResize };
}
