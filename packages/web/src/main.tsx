import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, Outlet, RouterProvider, type LoaderFunctionArgs, redirect } from "react-router-dom";
import { RouteErrorBoundary } from "./app/RouteErrorBoundary";
import { fetchCurrentUser } from "./api/auth";
import { fetchWorkspaces } from "./api/workspaces";
import { fetchWorkbooks, fetchWorkbook } from "./api/workbooks";
import { fetchSessions } from "./api/sessions";
import { fetchMessages } from "./api/chat";
import "./styles/tokens.css";
import "./styles/theme.css";
import "./index.css";
import App from "./App";

async function protectedLoader() {
  try {
    const currentUser = await fetchCurrentUser();
    return { currentUser };
  } catch {
    throw redirect("/login");
  }
}

async function workspaceLoader({ params }: LoaderFunctionArgs) {
  const workspaces = await fetchWorkspaces();
  const ws = workspaces.find((w) => w.publicId === params.workspacePublicId);
  if (!ws) throw new Response(null, { status: 404 });
  const [workbooks, sessions] = await Promise.all([
    fetchWorkbooks(ws.id),
    fetchSessions(ws.id),
  ]);
  return { workspaces, workspace: ws, workbooks, sessions };
}

async function workbookLoader({ params }: LoaderFunctionArgs) {
  const workspaces = await fetchWorkspaces();
  const ws = workspaces.find((w) => w.publicId === params.workspacePublicId);
  if (!ws) throw new Response(null, { status: 404 });
  const workbooks = await fetchWorkbooks(ws.id);
  const wb = workbooks.find((w) => w.publicId === params.workbookPublicId);
  if (!wb) throw new Response(null, { status: 404 });
  const [currentWorkbook, sessions] = await Promise.all([
    fetchWorkbook(ws.id, wb.id),
    fetchSessions(ws.id),
  ]);
  return { workspaces, workspace: ws, workbooks, currentWorkbook, sessions };
}

async function sessionLoader({ params }: LoaderFunctionArgs) {
  const workspaces = await fetchWorkspaces();
  const ws = workspaces.find((w) => w.publicId === params.workspacePublicId);
  if (!ws) throw new Response(null, { status: 404 });
  const workbooks = await fetchWorkbooks(ws.id);
  const wb = workbooks.find((w) => w.publicId === params.workbookPublicId);
  if (!wb) throw new Response(null, { status: 404 });
  const [currentWorkbook, sessions] = await Promise.all([
    fetchWorkbook(ws.id, wb.id),
    fetchSessions(ws.id),
  ]);
  const session = sessions.find((s) => s.publicId === params.sessionPublicId);
  let messages: unknown[] = [];
  let messageTotal = 0;
  if (session) {
    const result = await fetchMessages(ws.id, session.id);
    messages = result.messages;
    messageTotal = result.total;
  }
  return { workspaces, workspace: ws, workbooks, currentWorkbook, sessions, messages, messageTotal };
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
        id: "session-route",
        path: "workspaces/:workspacePublicId/workbooks/:workbookPublicId/sessions/:sessionPublicId",
        element: <App />,
        loader: sessionLoader,
      },
      {
        id: "workbook-route",
        path: "workspaces/:workspacePublicId/workbooks/:workbookPublicId",
        element: <App />,
        loader: workbookLoader,
      },
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