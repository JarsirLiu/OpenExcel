import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchSessions } from "@/api/sessions";
import { fetchWorkbooks } from "@/api/workbooks";
import { fetchWorkspaces } from "@/api/workspaces";

export async function workspaceLoader({ params }: LoaderFunctionArgs) {
  if (!params.workspacePublicId) {
    throw new Response(null, { status: 400, statusText: "Workspace id is required" });
  }

  const workspaces = await fetchWorkspaces();
  const workspace = workspaces.find((item) => item.publicId === params.workspacePublicId);
  if (!workspace) {
    throw new Response(null, { status: 404, statusText: "Workspace not found" });
  }

  const [workbooks, sessions] = await Promise.all([
    fetchWorkbooks(workspace.id),
    fetchSessions(workspace.id),
  ]);

  return { workspaces, workspace, workbooks, sessions };
}
