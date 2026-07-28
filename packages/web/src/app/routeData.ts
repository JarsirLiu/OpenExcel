import type { Session } from "@/api/sessions";
import type { WorkbookMeta } from "@/api/workbooks";
import type { Workspace } from "@/api/workspaces";

export type WorkbenchRouteData = {
  workspaces: Workspace[];
  workspace: Workspace;
  workbooks: WorkbookMeta[];
  sessions: Session[];
};
