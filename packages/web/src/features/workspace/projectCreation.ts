import { createWorkbook, importWorkbooks } from "@/api/workbooks";
import { createWorkspace, type Workspace } from "@/api/workspaces";

/**
 * Creates only the project resource. Workbook creation belongs to the
 * workbook action in the empty workspace view.
 */
export async function createProject(): Promise<Workspace> {
  return createWorkspace("新项目");
}

/**
 * Empty-state flow when there is no current project: create the project and
 * then create the workbook requested by the user.
 */
export async function createProjectWithBlankWorkbook(): Promise<Workspace> {
  const workspace = await createProject();
  await createWorkbook(workspace.id);
  return workspace;
}

export async function createProjectFromImport(file: File): Promise<Workspace> {
  const workspace = await createWorkspace("新项目");
  await importWorkbooks(workspace.id, file);
  return workspace;
}
