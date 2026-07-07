import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, Outlet, RouterProvider, type LoaderFunctionArgs, redirect } from "react-router-dom";
import { RouteErrorBoundary } from "./app/RouteErrorBoundary";
import { fetchCurrentUser } from "./api/auth";
import { getCachedUser } from "./api/authCache";
import { fetchWorkspaces } from "./api/workspaces";
import { fetchWorkbooks } from "./api/workbooks";
import { fetchSessions } from "./api/sessions";
import type { Workspace } from "./api/workspaces";
import "./styles/tokens.css";
import "./styles/theme.css";
import "./index.css";
import App from "./App";

type WorkspaceData = {
  workspaces: Workspace[];
  workspace: Workspace;
};

async function resolveWorkspace(publicId: string): Promise<WorkspaceData> {
  const workspaces = await fetchWorkspaces();
  const workspace = workspaces.find((w) => w.publicId === publicId);
  if (!workspace) throw new Response(null, { status: 404, statusText: "Workspace not found" });
  return { workspaces, workspace };
}

async function protectedLoader() {
  const cached = getCachedUser();
  if (cached) return { currentUser: cached };
  try {
    const currentUser = await fetchCurrentUser();
    return { currentUser };
  } catch {
    throw redirect("/login");
  }
}

async function workspaceLoader({ params }: LoaderFunctionArgs) {
  if (!params.workspacePublicId) throw new Response(null, { status: 400 });
  const { workspaces, workspace } = await resolveWorkspace(params.workspacePublicId);
  const [workbookResult, sessionResult] = await Promise.all([
    fetchWorkbooks(workspace.id),
    fetchSessions(workspace.id),
  ]);
  return { workspaces, workspace, workbooks: workbookResult, sessions: sessionResult };
}

const router = createHashRouter([
  {
    path: "/login",
    element: <App />,
  },
  {
    path: "/register",
    element: <App />,
  },
  {
    id: "protected",
    element: <Outlet />,
    errorElement: <RouteErrorBoundary />,
    loader: protectedLoader,
    children: [
      {
        id: "workspace-route",
        path: "workspaces/:workspacePublicId",
        element: <App />,
        loader: workspaceLoader,
      },
      {
        path: "*",
        element: <App />,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);