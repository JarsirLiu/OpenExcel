import { lazy, type ReactNode, Suspense } from "react";
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
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { routePaths } from "./routePaths";

const DemoCatalogPage = lazy(() =>
  import("@/features/demos/shell/DemoCatalogPage").then(({ DemoCatalogPage }) => ({
    default: DemoCatalogPage,
  })),
);
const DemoPage = lazy(() =>
  import("@/features/demos/shell/DemoPage").then(({ DemoPage }) => ({ default: DemoPage })),
);

function RouteLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-page)",
        color: "var(--text-secondary)",
        fontSize: 14,
      }}
    >
      加载中…
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

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
            element: (
              <LazyRoute>
                <DemoCatalogPage />
              </LazyRoute>
            ),
          },
          {
            path: ":demoId",
            loader: demoLoader,
            element: (
              <LazyRoute>
                <DemoRoutePage />
              </LazyRoute>
            ),
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
