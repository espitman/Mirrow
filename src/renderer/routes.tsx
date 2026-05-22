import { createRootRoute, createRoute, createRouter, Navigate, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { Sidebar } from "./components/Sidebar";
import { AboutPage } from "./routes/about";
import { HistoryPage } from "./routes/history";
import { SettingsPage } from "./routes/settings";
import { TranslatePage } from "./routes/translate";

const rootRoute = createRootRoute({
  component: () => (
    <div className="h-screen overflow-hidden bg-ink text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.26),transparent_34%),linear-gradient(145deg,#070816,#101329_58%,#070816)]" />
      <div className="relative flex h-full">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/translate" replace />,
});

const translateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/translate",
  component: TranslatePage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: AboutPage,
});

const routeTree = rootRoute.addChildren([indexRoute, translateRoute, historyRoute, settingsRoute, aboutRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
