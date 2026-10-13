import { useCallback, useMemo } from "react";
import { Link, useOutletContext } from "react-router";
import { CheckCircle2, Menu, RotateCcw, Trash2 } from "lucide-react";
import { Alert, Button, EmptyState, IconButton, Skeleton } from "../../../components/ui/index.js";
import { formatLongDate } from "../../../lib/date.js";
import { useGoals } from "../hooks/useGoals.js";
import { useTasks } from "../../tasks/hooks/useTasks.js";
import { getGoalColorHex, getProgress } from "../goals.selectors.js";
import GoalIcon from "../components/GoalIcon.jsx";
import LifeAreaAvatar from "../components/LifeAreaAvatar.jsx";

function CompletedGoalsPage() {
  const { onOpenSidebar } = useOutletContext() ?? {};
  const { goals, lifeAreaById, isLoading, actionError, clearActionError, toggleComplete, deleteGoal } = useGoals();
  const { tasksByGoal, removeTasksForGoals } = useTasks();

  const completed = useMemo(
    () => goals.filter((g) => g.completedAt).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)),
    [goals],
  );

  const handleDelete = useCallback(
    (goal) => {
      if (window.confirm(`Delete “${goal.title}”? This cannot be undone. Its subgoals and tasks will be deleted too.`)) {
        deleteGoal(goal.id).then(removeTasksForGoals).catch(() => {});
      }
    },
    [deleteGoal, removeTasksForGoals],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="lg:hidden" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">Completed</h1>
          <p className="truncate text-xs text-slate-500">
            {isLoading ? "Loading…" : `${completed.length} completed ${completed.length === 1 ? "goal" : "goals"}`}
          </p>
        </div>
      </div>

      {actionError && (
        <div className="px-4 pt-3 sm:px-5">
          <Alert onDismiss={clearActionError}>{actionError}</Alert>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-5 py-3.5">
                <Skeleton className="h-7 w-7 rounded-lg" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && completed.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="No completed goals yet"
            description="When you finish a goal, choose “Complete goal” from its menu and it will be listed here."
            action={<Link to="/goals" className="text-sm font-medium text-brand-700 hover:underline">Go to goals</Link>}
          />
        )}

        {!isLoading && completed.length > 0 && (
          <ul>
            {completed.map((goal) => {
              const lifeArea = lifeAreaById.get(goal.lifeAreaId);
              const taskCount = tasksByGoal.get(goal.id)?.length ?? 0;
              return (
                <li key={goal.id} className="group flex items-center gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50/80 sm:px-5">
                  <GoalIcon colorHex={getGoalColorHex(goal, lifeArea)} completed />
                  <div className="min-w-0 flex-1">
                    <Link to={`/goals/${goal.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">
                      {goal.title}
                    </Link>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span>Completed {formatLongDate(goal.completedAt)}</span>
                      {lifeArea && (
                        <span className="inline-flex items-center gap-1">
                          <LifeAreaAvatar lifeArea={lifeArea} size="sm" />
                          {lifeArea.name}
                        </span>
                      )}
                      <span>{taskCount} {taskCount === 1 ? "task" : "tasks"}</span>
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-sm text-slate-600 sm:inline" title="Progress from completed tasks">
                    {getProgress(goal)}%
                  </span>
                  <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => toggleComplete(goal).catch(() => {})}>
                    Reopen
                  </Button>
                  <IconButton icon={Trash2} size="sm" label="Delete goal" onClick={() => handleDelete(goal)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default CompletedGoalsPage;
