import { useCallback, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { ChevronsDownUp, ChevronsUpDown, ListChecks, Menu, Plus, Target } from "lucide-react";
import { Alert, Button, EmptyState, IconButton, Skeleton } from "../../../components/ui/index.js";
import { useGoals } from "../../goals/hooks/useGoals.js";
import { useTaskToggle, useTasks } from "../hooks/useTasks.js";
import { useCollapsedGroups } from "../hooks/useCollapsedGroups.js";
import { useAuth } from "../../auth/hooks/useAuth.js";
import TaskFormModal from "./TaskFormModal.jsx";
import TaskGroupList, { TodoSection } from "./TaskGroupList.jsx";
import { byRoadmapOrder } from "../../roadmap/roadmap.selectors.js";

/**
 * Task list grouped by goal (used by Today). `includeGoal` picks which goals' tasks are shown
 * (e.g. only goals running today); `includeTodo(todo, today)` picks the to-dos. Each group can be
 * collapsed; `groupStateKey` names where those choices are remembered.
 */
const includeEveryTask = () => true;
const TODO_GROUP = "todos";
function TaskListPage({ title, includeGoal, includeTodo, includeTask = includeEveryTask, emptyTitle, emptyDescription, groupStateKey }) {
  const { onOpenSidebar } = useOutletContext() ?? {};
  const { user } = useAuth();
  const collapse = useCollapsedGroups(groupStateKey && user ? `${groupStateKey}:${user.id}` : null);
  const { goals, isLoading: goalsLoading } = useGoals();
  const {
    tasksByGoal, todos, today, status, error, actionError, isLoading: tasksLoading,
    load, createTask, updateTask, deleteTask, clearActionError,
  } = useTasks();

  const [modal, setModal] = useState({ open: false, task: null, goalId: null });

  const openCreate = useCallback((goalId = null) => setModal({ open: true, task: null, goalId }), []);
  const openEdit = useCallback((task) => setModal({ open: true, task, goalId: task.goalId }), []);
  const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false })), []);

  const handleSubmit = useCallback(
    async ({ goalId, ...fields }) => {
      if (modal.task) await updateTask(modal.task, fields); // fields fit the task's kind (see TaskFormModal)
      else await createTask({ goalId, ...fields });
      closeModal();
    },
    [modal.task, createTask, updateTask, closeModal],
  );

  const handleDelete = useCallback(
    (task) => {
      if (window.confirm(`Delete “${task.title}”? This cannot be undone.`)) deleteTask(task).catch(() => {});
    },
    [deleteTask],
  );

  const [handleToggle, pendingIds] = useTaskToggle();

  const visibleGoals = useMemo(() => goals.filter(includeGoal), [goals, includeGoal]);
  const openGoals = useMemo(() => visibleGoals.filter((g) => !g.completedAt), [visibleGoals]);

  const groups = useMemo(
    () =>
      visibleGoals
        .map((goal) => ({
          goal,
          // Daily tasks first, then roadmap tasks in schedule order.
          tasks: (tasksByGoal.get(goal.id) ?? [])
            .filter((task) => includeTask(task, today, goal))
            .sort((a, b) => Number(a.isRoadmap) - Number(b.isRoadmap) || (a.isRoadmap ? byRoadmapOrder(a, b) : 0)),
        }))
        .filter((group) => group.tasks.length > 0),
    [visibleGoals, tasksByGoal, includeTask, today],
  );

  const visibleTodos = useMemo(
    () =>
      todos
        .filter((todo) => includeTodo(todo, today))
        .sort((a, b) => Number(a.completedToday) - Number(b.completedToday) || (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    [todos, today, includeTodo],
  );

  const visibleTasks = [...visibleTodos, ...groups.flatMap((g) => g.tasks)];
  const sections = [...(visibleTodos.length ? [{ id: TODO_GROUP, tasks: visibleTodos }] : []), ...groups.map((g) => ({ id: g.goal.id, tasks: g.tasks }))];
  const allExpanded = sections.every((section) => collapse.isExpanded(section.id, section.tasks));
  const doneToday = visibleTasks.filter((t) => t.completedToday).length;
  const loading = goalsLoading || tasksLoading;
  const subtitle = loading ? "Loading your tasks…" : `${doneToday} of ${visibleTasks.length} done today`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="lg:hidden" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
            <p className="truncate text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!loading && sections.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              icon={allExpanded ? ChevronsDownUp : ChevronsUpDown}
              onClick={() => collapse.setAll(sections.map((section) => section.id), !allExpanded)}
              aria-label={allExpanded ? "Collapse all groups" : "Expand all groups"}
            >
              <span className="hidden sm:inline">{allExpanded ? "Collapse all" : "Expand all"}</span>
            </Button>
          )}
          <Button icon={Plus} onClick={() => openCreate()} aria-label="New task">
            <span className="hidden sm:inline">New task</span>
          </Button>
        </div>
      </div>

      {(actionError || status === "error") && (
        <div className="px-4 pt-3 sm:px-5">
          {actionError && <Alert onDismiss={clearActionError}>{actionError}</Alert>}
          {status === "error" && (
            <Alert>
              Couldn’t load tasks. {error}{" "}
              <Button variant="ghost" size="sm" onClick={load} className="ml-1 underline">Retry</Button>
            </Alert>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-5 py-3.5">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        )}

        {!loading && visibleTasks.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title={emptyTitle}
            description={emptyDescription}
            action={
              <div className="flex flex-col items-center gap-3">
                <Button onClick={() => openCreate()}>Add a task</Button>
                {goals.length === 0 && (
                  <Link to="/goals" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                    <Target className="h-4 w-4" aria-hidden="true" />
                    Or create a goal with daily tasks
                  </Link>
                )}
              </div>
            }
          />
        )}

        {!loading && visibleTodos.length > 0 && (
          <TodoSection
            todos={visibleTodos}
            today={today}
            onToggle={handleToggle}
            pendingIds={pendingIds}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdd={openCreate}
            expanded={collapse.isExpanded(TODO_GROUP, visibleTodos)}
            onToggleExpanded={() => collapse.toggle(TODO_GROUP, visibleTodos)}
          />
        )}

        {!loading && (
          <TaskGroupList
            groups={groups}
            pendingIds={pendingIds}
            onToggle={handleToggle}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdd={openCreate}
            isExpanded={collapse.isExpanded}
            onToggleExpanded={collapse.toggle}
          />
        )}
      </div>

      <TaskFormModal
        open={modal.open}
        task={modal.task}
        goals={modal.task ? goals : openGoals}
        defaultGoalId={modal.goalId}
        today={today}
        onSubmit={handleSubmit}
        onClose={closeModal}
      />
    </div>
  );
}

export default TaskListPage;
