import { createBrowserRouter, Outlet, useLoaderData } from "react-router-dom";
import { AppShell, AuthPage, NotFoundPage, WorkbenchPage } from "@/App";
import { demoLoader } from "@/app/loaders/demoLoader";
import { protectedLoader } from "@/app/loaders/protectedLoader";
import { authPageLoader, publicHomeLoader } from "@/app/loaders/publicLoader";
import { workspaceLoader } from "@/app/loaders/workspaceLoader";
import type { DemoDefinition } from "@/features/demos/runtime/replayTypes";
import { DemoPage } from "@/features/demos/shell/DemoPage";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function DemoRoutePage() {
  const { demo } = useLoaderData() as { demo: DemoDefinition };
  return <DemoPage scenario={demo} />;
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        loader: publicHomeLoader,
        element: <AuthPage mode="login" />,
      },
      {
        path: "login",
        loader: authPageLoader,
        element: <AuthPage mode="login" />,
      },
      {
        path: "register",
        loader: authPageLoader,
        element: <AuthPage mode="register" />,
      },
      {
        path: "demos/:demoId",
        loader: demoLoader,
        element: <DemoRoutePage />,
      },
      {
        id: "protected",
        element: <Outlet />,
        loader: protectedLoader,
        children: [
          {
            id: "workspace-route",
            path: "workspaces/:workspacePublicId",
            element: <WorkbenchPage />,
            loader: workspaceLoader,
          },
        ],
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
