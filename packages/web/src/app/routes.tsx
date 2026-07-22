import {
  createBrowserRouter,
  type LoaderFunctionArgs,
  Outlet,
  type RouteObject,
  redirect,
  useLoaderData,
} from "react-router-dom";
import { AppShell, AuthPage, NotFoundPage, WorkbenchPage } from "@/App";
import { demoLoader } from "@/app/loaders/demoLoader";
import { protectedLoader } from "@/app/loaders/protectedLoader";
import { authPageLoader } from "@/app/loaders/publicLoader";
import { workspaceLoader } from "@/app/loaders/workspaceLoader";
import type { DemoDefinition } from "@/features/demos/runtime/replayTypes";
import { DemoCatalogPage } from "@/features/demos/shell/DemoCatalogPage";
import { DemoPage } from "@/features/demos/shell/DemoPage";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { routePaths } from "./routePaths";

function DemoRoutePage() {
  const { demo } = useLoaderData() as { demo: DemoDefinition };
  return <DemoPage scenario={demo} />;
}

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: <AuthPage mode="login" showMarketing />,
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
        path: "demos",
        children: [
          {
            index: true,
            element: <DemoCatalogPage />,
          },
          {
            path: ":demoId",
            loader: demoLoader,
            element: <DemoRoutePage />,
          },
        ],
      },
      {
        path: "demo",
        children: [
          {
            index: true,
            loader: () => redirect(routePaths.demos),
          },
          {
            path: ":demoId",
            loader: ({ params }: LoaderFunctionArgs) =>
              redirect(routePaths.demo(params.demoId ?? "")),
          },
        ],
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
];

export const router = createBrowserRouter(routes);
