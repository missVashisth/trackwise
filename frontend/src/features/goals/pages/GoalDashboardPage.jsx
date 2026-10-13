// Workspace for a single goal (/goals/:goalId). Goal and task data come from the app-wide stores
// (already loaded by the shell, and updated in place by every mutation); only the goal's history
// is fetched here. The backend checks ownership for every request.

import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { Menu, Target } from "lucide-react";
import { Alert, Button, EmptyState, IconButton, Skeleton } from "../../../components/ui/index.js";
import { useGoals } from "../hooks/useGoals.js";
import { useGoalInsights } from "../hooks/useGoalInsights.js";
import { useTaskToggle, useTasks } from "../../tasks/hooks/useTasks.js";
import { getGoalColorHex } from "../goals.selectors.js";
import GoalFormModal from "../components/GoalFormModal.jsx";
import TaskFormModal from "../../tasks/components/TaskFormModal.jsx";
import GoalDashboardHeader, { GoalTabs } from "../components/dashboard/GoalDashboardHeader.jsx";
import GoalOverviewTab from "../components/dashboard/GoalOverviewTab.jsx";
import GoalProgressTab from "../components/dashboard/GoalProgressTab.jsx";
import GoalRoadmapTab from "../components/dashboard/GoalRoadmapTab.jsx";
import GoalTasksTab from "../components/dashboard/GoalTasksTab.jsx";
import { GOAL_TABS, goalStatusOf } from "../components/dashboard/dashboard.utils.js";
import RoadmapWizard from "../../roadmap/components/RoadmapWizard.jsx";
import { useApplySavedRoadmap } from "../../roadmap/hooks/useApplySavedRoadmap.js";
import { groupRoadmapTasks, splitGoalTasks } from "../../roadmap/roadmap.selectors.js";

const NO_TASKS = [];

function DashboardMessage({ onOpenSidebar, children }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="lg:hidden" />
        <Link to="/goals" className="text-sm font-medium text-slate-600 hover:text-slate-900">← Goals</Link>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function GoalDashboardPage() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const { onOpenSidebar } = useOutletContext() ?? {};
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = GOAL_TABS.some((t) => t.id === requestedTab) ? requestedTab : "overview";

  const {
    goals, lifeAreas, lifeAreaById, status: goalsStatus, error: goalsError, actionError, isLoading: goalsLoading,
    load: loadGoals, updateGoal, deleteGoal, toggleFavorite, toggleComplete, clearActionError,
  } = useGoals();
  const {
    tasksByGoal, today, status: tasksStatus, error: tasksError, actionError: taskActionError,
    load: loadTasks, createTask, updateTask, deleteTask, removeTasksForGoals, clearActionError: clearTaskError,
  } = useTasks();
  const [handleToggle, pendingIds] = useTaskToggle();

  const goal = goals.find((g) => g.id === goalId) ?? null;
  const tasks = tasksByGoal.get(goalId) ?? NO_TASKS;
  // Daily (recurring) tasks and one-time roadmap tasks share the store; most panels need them apart.
  const { roadmap: roadmapTasks, daily: dailyTasks } = useMemo(() => splitGoalTasks(tasks), [tasks]);
  const roadmapGroups = useMemo(() => groupRoadmapTasks(roadmapTasks), [roadmapTasks]);
  const subgoals = useMemo(() => goals.filter((g) => g.parentGoalId === goalId), [goals, goalId]);
  const parent = goal?.parentGoalId ? goals.find((g) => g.id === goal.parentGoalId) ?? null : null;
  const lifeArea = goal ? lifeAreaById.get(goal.lifeAreaId) : null;
  const colorHex = goal ? getGoalColorHex(goal, lifeArea) : undefined;
  const status = goal ? goalStatusOf(goal) : null;

  // Refetch the history whenever something it is built from changes: progress (every tick, undo
  // and task edit returns fresh progress), the goal's lifecycle, its tasks, or the user's day.
  const refreshKey = goal
    ? [goal.progress?.overall, goal.progress?.today, goal.status, goal.startDate, goal.totalDays, today, tasks.map((t) => `${t.id}:${t.title}:${t.weightage}:${t.completedToday}:${t.roadmapStatus}`).join(",")].join("|")
    : "";
  const tasksSettled = tasksStatus === "ready" || tasksStatus === "error";
  const { insights, isLoading: insightsLoading, error: insightsError, notFound, reload: reloadInsights } = useGoalInsights(goalId, {
    enabled: Boolean(goal) && tasksSettled,
    refreshKey,
  });

  const showTab = useCallback(
    (id) => setSearchParams(id === "overview" ? {} : { tab: id }, { replace: true, preventScrollReset: true }),
    [setSearchParams],
  );

  // ---- Goal actions (existing goal store)
  const [editingGoal, setEditingGoal] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleGoalSubmit = useCallback(
    async (payload) => {
      await updateGoal(goalId, payload);
      setEditingGoal(false);
    },
    [goalId, updateGoal],
  );

  const handleToggleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      await toggleComplete(goal);
    } catch {
      // shown via actionError
    } finally {
      setCompleting(false);
    }
  }, [goal, toggleComplete]);

  const handleDeleteGoal = useCallback(() => {
    if (!window.confirm(`Delete “${goal.title}”? This cannot be undone. Its subgoals and tasks will be deleted too.`)) return;
    setDeleting(true);
    deleteGoal(goal.id)
      .then((ids) => {
        removeTasksForGoals(ids);
        navigate("/goals", { replace: true });
      })
      .catch(() => setDeleting(false));
  }, [goal, deleteGoal, removeTasksForGoals, navigate]);

  // ---- Task actions (existing task store and modal)
  const [taskModal, setTaskModal] = useState({ open: false, task: null, kind: "daily" });
  const openAddTask = useCallback(() => setTaskModal({ open: true, task: null, kind: "daily" }), []);
  const openAddRoadmapTask = useCallback(() => setTaskModal({ open: true, task: null, kind: "roadmap" }), []);
  const openEditTask = useCallback((task) => setTaskModal({ open: true, task, kind: task.isRoadmap ? "roadmap" : "daily" }), []);
  const closeTaskModal = useCallback(() => setTaskModal((m) => ({ ...m, open: false })), []);

  const handleTaskSubmit = useCallback(
    async (values) => {
      // The modal returns the fields of the task's kind (daily: weightage; roadmap: schedule).
      const fields = { ...values };
      delete fields.goalId;
      if (taskModal.task) await updateTask(taskModal.task, fields);
      else await createTask({ ...fields, goalId });
      closeTaskModal();
    },
    [taskModal.task, goalId, createTask, updateTask, closeTaskModal],
  );

  const handleDeleteTask = useCallback(
    (task) => {
      if (window.confirm(`Delete “${task.title}”? This cannot be undone.`)) deleteTask(task).catch(() => {});
    },
    [deleteTask],
  );

  // ---- AI roadmap for this goal (only offered while it has none)
  const [planning, setPlanning] = useState(false);
  const applySavedRoadmap = useApplySavedRoadmap();

  // ---- Loading / error / not found
  if (deleting && !goal) return null;

  if (goalsStatus === "error") {
    return (
      <DashboardMessage onOpenSidebar={onOpenSidebar}>
        <div className="p-4 sm:p-5">
          <Alert>
            Couldn’t load this goal. {goalsError}{" "}
            <Button variant="ghost" size="sm" onClick={loadGoals} className="ml-1 underline">Retry</Button>
          </Alert>
        </div>
      </DashboardMessage>
    );
  }

  if (goalsLoading && !goal) {
    return (
      <DashboardMessage onOpenSidebar={onOpenSidebar}>
        <div className="flex flex-col gap-4 p-4 sm:p-5" aria-busy="true" aria-label="Loading goal">
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-2 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        </div>
      </DashboardMessage>
    );
  }

  if (!goal || notFound) {
    return (
      <DashboardMessage onOpenSidebar={onOpenSidebar}>
        <EmptyState
          icon={Target}
          title="Goal not found"
          description="It may have been deleted, or the link is wrong."
          action={<Link to="/goals" className="text-sm font-medium text-brand-700 hover:underline">Back to goals</Link>}
        />
      </DashboardMessage>
    );
  }

  const panelProps = { goal, status, colorHex, tasks: dailyTasks, roadmapTasks, roadmapGroups, today, insights, subgoals };
  const taskActions = { pendingIds, onToggle: handleToggle, onEdit: openEditTask, onDelete: handleDeleteTask };
  const canPlan = !goal.roadmap && status !== "completed";

  return (
    <div className="flex h-full flex-col">
      <GoalDashboardHeader
        goal={goal}
        status={status}
        parent={parent}
        lifeArea={lifeArea}
        colorHex={colorHex}
        onOpenSidebar={onOpenSidebar}
        onEdit={() => setEditingGoal(true)}
        onToggleComplete={handleToggleComplete}
        onToggleFavorite={() => toggleFavorite(goal).catch(() => {})}
        onDelete={handleDeleteGoal}
        completing={completing}
      />
      <GoalTabs active={tab} onChange={showTab} counts={{ tasks: tasks.length }} />

      <div className="flex-1 overflow-y-auto bg-slate-50/60">
        <div id="goal-tabpanel" role="tabpanel" aria-labelledby={`goal-tab-${tab}`} className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-5">
          {actionError && <Alert onDismiss={clearActionError}>{actionError}</Alert>}
          {taskActionError && <Alert onDismiss={clearTaskError}>{taskActionError}</Alert>}
          {tasksStatus === "error" && (
            <Alert>
              Couldn’t load tasks. {tasksError}{" "}
              <Button variant="ghost" size="sm" onClick={loadTasks} className="ml-1 underline">Retry</Button>
            </Alert>
          )}
          {insightsError && insights && tab !== "progress" && (
            <Alert>
              Couldn’t refresh this goal’s history ({insightsError}).{" "}
              <Button variant="ghost" size="sm" onClick={reloadInsights} className="ml-1 underline">Retry</Button>
            </Alert>
          )}

          {tab === "overview" && (
            <GoalOverviewTab
              {...panelProps}
              {...taskActions}
              onEditTask={openEditTask}
              onDeleteTask={handleDeleteTask}
              onShowTab={showTab}
            />
          )}
          {tab === "progress" && (
            <GoalProgressTab {...panelProps} isLoading={insightsLoading} error={insightsError} onRetry={reloadInsights} />
          )}
          {tab === "roadmap" && (
            <GoalRoadmapTab
              {...panelProps}
              {...taskActions}
              onAddTask={openAddTask}
              onAddRoadmapTask={openAddRoadmapTask}
              onPlanWithAi={canPlan ? () => setPlanning(true) : null}
            />
          )}
          {tab === "tasks" && <GoalTasksTab {...panelProps} {...taskActions} onAdd={openAddTask} onAddRoadmapTask={openAddRoadmapTask} />}
        </div>
      </div>

      {planning && (
        <RoadmapWizard
          goal={goal}
          today={today}
          onClose={() => setPlanning(false)}
          onSaved={(saved) => {
            applySavedRoadmap(saved);
            setPlanning(false);
          }}
        />
      )}
      <GoalFormModal open={editingGoal} goal={goal} lifeAreas={lifeAreas} onSubmit={handleGoalSubmit} onClose={() => setEditingGoal(false)} />
      <TaskFormModal
        open={taskModal.open}
        task={taskModal.task}
        goals={[goal]}
        defaultGoalId={goal.id}
        defaultKind={taskModal.kind}
        lockGoal
        today={today}
        onSubmit={handleTaskSubmit}
        onClose={closeTaskModal}
      />
    </div>
  );
}

export default GoalDashboardPage;
