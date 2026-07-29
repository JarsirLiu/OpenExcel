import { type LoaderFunctionArgs, redirect } from "react-router-dom";
import { fetchSessions } from "@/api/sessions";
import { fetchWorkbooks } from "@/api/workbooks";
import { fetchWorkspaces } from "@/api/workspaces";
import { routePaths } from "@/app/routePaths";

export async function workspaceLoader({ params, request }: LoaderFunctionArgs) {
  if (!params.workspacePublicId) {
    throw new Response(null, { status: 400, statusText: "Workspace id is required" });
  }

  const workspaces = await fetchWorkspaces({ signal: request.signal });
  const workspace = workspaces.find((item) => item.publicId === params.workspacePublicId);
  if (!workspace && workspaces.length === 0) {
    throw redirect(routePaths.workspaceRoot);
  }
  if (!workspace) {
    throw new Response(null, { status: 404, statusText: "Workspace not found" });
  }

  const [workbooks, sessions] = await Promise.all([
    fetchWorkbooks(workspace.id, { signal: request.signal }),
    fetchSessions(workspace.id, { signal: request.signal }),
  ]);

  // Workbook hydration belongs to the document controller, not the route loader.
  return { workspaces, workspace, workbooks, sessions };
}
