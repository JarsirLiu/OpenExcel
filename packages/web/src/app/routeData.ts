import type { Session } from "@/api/sessions";
import type { WorkbookFull, WorkbookMeta } from "@/api/workbooks";
import type { Workspace } from "@/api/workspaces";

export type WorkbenchRouteData = {
  workspaces: Workspace[];
  workspace: Workspace;
  workbooks: WorkbookMeta[];
  sessions: Session[];
  currentWorkbook?: WorkbookFull;
  messages?: unknown[];
  messageTotal?: number;
};
