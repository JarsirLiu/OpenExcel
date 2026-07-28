import { useCallback, useEffect, useState } from "react";
import { usePanelResize } from "@/shared/hooks/usePanelResize";

export const WORKSPACE_SIDEBAR_MIN_WIDTH = 210;
export const WORKSPACE_SIDEBAR_DEFAULT_WIDTH = 246;
export const WORKSPACE_SIDEBAR_COLLAPSED_WIDTH = 32;

const COLLAPSED_KEY = "openexcel:sidebarCollapsed:v2";
const WIDTH_KEY = "openexcel:sidebarWidth";

function storageKey(key: string, namespace?: string) {
  return namespace ? `${key}:${namespace}` : key;
}

export type WorkspaceSidebarLayout = {
  collapsed: boolean;
  width: number;
  isResizing: boolean;
  onToggleCollapsed: () => void;
  onResizeMouseDown: React.MouseEventHandler;
};

export function useWorkspaceSidebarLayout(namespace?: string): WorkspaceSidebarLayout {
  const collapsedKey = storageKey(COLLAPSED_KEY, namespace);
  const widthKey = storageKey(WIDTH_KEY, namespace);
  const [collapsed, setCollapsed] = useState(() => {
    const stored = sessionStorage.getItem(collapsedKey);
    return stored !== null ? stored === "true" : false;
  });
  const [initialWidth] = useState(() => {
    const value = Number(sessionStorage.getItem(widthKey));
    return Number.isFinite(value) && value >= WORKSPACE_SIDEBAR_MIN_WIDTH
      ? value
      : WORKSPACE_SIDEBAR_DEFAULT_WIDTH;
  });
  const { width, isResizing, handleMouseDown } = usePanelResize({
    initialWidth,
    minWidth: WORKSPACE_SIDEBAR_MIN_WIDTH,
    edge: "right",
  });

  useEffect(
    () => sessionStorage.setItem(collapsedKey, String(collapsed)),
    [collapsed, collapsedKey],
  );
  useEffect(() => sessionStorage.setItem(widthKey, String(width)), [width, widthKey]);

  const onToggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);
  return { collapsed, width, isResizing, onToggleCollapsed, onResizeMouseDown: handleMouseDown };
}
