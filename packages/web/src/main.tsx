import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, Outlet, RouterProvider } from "react-router-dom";
import { protectedLoader } from "./app/loaders/protectedLoader";
import { workspaceLoader } from "./app/loaders/workspaceLoader";
import { RouteErrorBoundary } from "./app/RouteErrorBoundary";
import "./styles/tokens.css";
import "./styles/theme.css";
import "./index.css";
import App from "./App";

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
    hydrateFallbackElement: null,
    children: [
      {
        id: "workspace-route",
        path: "workspaces/:workspacePublicId",
        element: <App />,
        loader: workspaceLoader,
        hydrateFallbackElement: null,
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
  </React.StrictMode>,
);
