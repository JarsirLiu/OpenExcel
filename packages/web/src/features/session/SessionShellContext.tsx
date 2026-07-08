import { createContext, useContext } from "react";

type SessionInfra = {
  workspaceId: number;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onUndoComplete?: () => Promise<void> | void;
  onNavigateSheet?: (sheetId: number) => void;
  initialMessages?: unknown[];
};

const ctx = createContext<SessionInfra | null>(null);

export function SessionShellProvider({ children, value }: { children: React.ReactNode; value: SessionInfra }) {
  return <ctx.Provider value={value}>{children}</ctx.Provider>;
}

export function useSessionInfra(): SessionInfra {
  const v = useContext(ctx);
  if (!v) throw new Error("useSessionInfra must be used within SessionShellProvider");
  return v;
}