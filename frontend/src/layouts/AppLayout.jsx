import { useCallback, useState } from "react";
import { Outlet } from "react-router";
import { GoalsProvider } from "../features/goals/state/goals.context.jsx";
import { useGoals, useLoadGoals } from "../features/goals/hooks/useGoals.js";
import { TasksProvider } from "../features/tasks/state/tasks.context.jsx";
import { useLoadTasks, useReloadOnNewDay } from "../features/tasks/hooks/useTasks.js";
import Sidebar from "./Sidebar.jsx";

function Shell() {
  useLoadGoals();
  useLoadTasks();
  useReloadOnNewDay(useGoals().load);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const onOpenSidebar = useCallback(() => setSidebarOpen(true), []);
  const onCloseSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900">
      <Sidebar open={sidebarOpen} onClose={onCloseSidebar} />
      <main className="flex min-w-0 flex-1 flex-col p-0 lg:p-3 lg:pl-0">
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white lg:rounded-2xl lg:border lg:border-slate-200 lg:shadow-sm">
          <Outlet context={{ onOpenSidebar }} />
        </div>
      </main>
    </div>
  );
}

/** App shell: sidebar + content card. Wraps feature providers used app-wide. */
function AppLayout() {
  return (
    <GoalsProvider>
      <TasksProvider>
        <Shell />
      </TasksProvider>
    </GoalsProvider>
  );
}

export default AppLayout;
