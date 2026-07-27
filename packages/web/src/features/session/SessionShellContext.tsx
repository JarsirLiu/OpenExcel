import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import { createContext, useContext } from "react";
import type { Session } from "@/api/sessions";

type SheetChangedHandler = (
  sheetId: number,
  delta: SheetChangeDelta | null,
  version?: SheetChangeVersion,
) => void | Promise<void>;

type SessionInfra = {
  workspaceId: number;
  onAttachExcel: (files: File[]) => Promise<void> | void;
  referenceCacheRevision: number;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onSheetChanged?: SheetChangedHandler;
  onUndoComplete?: () => Promise<void> | void;
  onUserTurnAccepted: (sessionId: number) => void;
  onNavigateSheet?: (sheetId: number) => void;
  createSession: () => Promise<Session>;
  activateSession: (sessionId: number) => void;
};

const ctx = createContext<SessionInfra | null>(null);

export function SessionShellProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: SessionInfra;
}) {
  return <ctx.Provider value={value}>{children}</ctx.Provider>;
}

export function useSessionInfra(): SessionInfra {
  const v = useContext(ctx);
  if (!v) throw new Error("useSessionInfra must be used within SessionShellProvider");
  return v;
}
