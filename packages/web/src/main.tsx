import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { ProtectedRoute } from "./app/ProtectedRoute";
import { RouteErrorBoundary } from "./app/RouteErrorBoundary";
import { fetchWorkspaces } from "./api/workspaces";
import "./styles/tokens.css";
import "./styles/theme.css";
import "./index.css";
import App from "./App";

async function protectedLoader() {
  const workspaces = await fetchWorkspaces();
  return { workspaces };
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
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    loader: protectedLoader,
    children: [
      {
        path: "workspaces/:workspacePublicId/workbooks/:workbookPublicId/sessions/:sessionPublicId",
        element: <App />,
      },
      {
        path: "workspaces/:workspacePublicId/workbooks/:workbookPublicId",
        element: <App />,
      },
      {
        path: "workspaces/:workspacePublicId",
        element: <App />,
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