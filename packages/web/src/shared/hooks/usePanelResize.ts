import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type ResizeEdge = "left" | "right";

type ActiveDrag = {
  onMouseMove: (event: MouseEvent) => void;
  onMouseUp: () => void;
  previousCursor: string;
  previousUserSelect: string;
};

type UsePanelResizeOptions = {
  initialWidth: number;
  minWidth: number;
  edge: ResizeEdge;
};

export function usePanelResize({ initialWidth, minWidth, edge }: UsePanelResizeOptions) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(initialWidth);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const stopDrag = useCallback((commit: boolean) => {
    const activeDrag = activeDragRef.current;
    if (activeDrag == null) return;

    document.removeEventListener("mousemove", activeDrag.onMouseMove);
    document.removeEventListener("mouseup", activeDrag.onMouseUp);
    document.body.style.cursor = activeDrag.previousCursor;
    document.body.style.userSelect = activeDrag.previousUserSelect;
    activeDragRef.current = null;
    setIsResizing(false);

    if (commit) {
      const nextWidth = widthRef.current;
      setWidth(nextWidth);
    }
  }, []);

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      stopDrag(false);

      const startX = event.clientX;
      const startWidth = widthRef.current;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = edge === "right" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
        const nextWidth = Math.max(minWidth, startWidth + delta);
        widthRef.current = nextWidth;
        setWidth(nextWidth);
      };

      const onMouseUp = () => stopDrag(true);
      activeDragRef.current = {
        onMouseMove,
        onMouseUp,
        previousCursor,
        previousUserSelect,
      };
      setIsResizing(true);
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [edge, minWidth, stopDrag],
  );

  useEffect(() => {
    return () => {
      stopDrag(false);
    };
  }, [stopDrag]);

  return { width, isResizing, handleMouseDown };
}
