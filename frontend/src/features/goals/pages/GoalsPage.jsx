import { useCallback, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { Alert, Button } from "../../../components/ui/index.js";
import { errorMessage, UserMessageError } from "../../../lib/errors.js";
import { useGoals } from "../hooks/useGoals.js";
import { useGoalsView } from "../hooks/useGoalsView.js";
import { useTasks } from "../../tasks/hooks/useTasks.js";
import GoalFormModal from "../components/GoalFormModal.jsx";
import GoalsHeader from "../components/GoalsHeader.jsx";
import GoalsTable from "../components/GoalsTable.jsx";
import RoadmapWizard from "../../roadmap/components/RoadmapWizard.jsx";
import { useApplySavedRoadmap } from "../../roadmap/hooks/useApplySavedRoadmap.js";

function GoalsPage() {
  const { onOpenSidebar } = useOutletContext() ?? {};
  const {
    goals, lifeAreas, lifeAreaById, status, error, actionError, isLoading,
    load, createGoal, updateGoal, deleteGoal, toggleFavorite, toggleComplete, clearActionError,
  } = useGoals();

  const { tasksByGoal, today, createTask, removeTasksForGoals, clearActionError: clearTaskError } = useTasks();
  const navigate = useNavigate();
  const applySavedRoadmap = useApplySavedRoadmap();
  const [roadmapWizardOpen, setRoadmapWizardOpen] = useState(false);
  const goalsWithTaskCounts = useMemo(
    () => goals.map((goal) => ({ ...goal, tasksCount: tasksByGoal.get(goal.id)?.length ?? 0 })),
    [goals, tasksByGoal],
  );

  const { view, groups, subgoalsByParent, visibleCount, totalCount, activeFilterCount, setGrouping, toggleSort, setFilters, resetView } =
    useGoalsView(goalsWithTaskCounts, lifeAreas);

  const [modal, setModal] = useState({ open: false, goal: null, defaults: null });

  const openCreate = useCallback(() => setModal({ open: true, goal: null, defaults: null }), []);
  const openEdit = useCallback((goal) => setModal({ open: true, goal, defaults: null }), []);
  const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false })), []);

  // Creates/updates the goal (and the new goal's daily tasks). Throws for the form to show.
  const saveGoal = useCallback(
    async (payload, draftTasks) => {
      if (modal.goal) {
        await updateGoal(modal.goal.id, payload);
        return;
      }
      const goal = await createGoal(payload);
      try {
        for (const { title, weightage } of draftTasks) {
          await createTask({ goalId: goal.id, title, weightage });
        }
      } catch (err) {
        // Undo the half-saved goal (deleting it also removes the tasks already created),
        // so pressing Save again cannot leave a duplicate goal behind.
        clearTaskError();
        try {
          removeTasksForGoals(await deleteGoal(goal.id));
        } catch {
          throw new UserMessageError("The goal was saved, but some of its tasks were not. Open the goal to add them.", { cause: err });
        }
        throw new UserMessageError(`Couldn’t save the tasks. ${errorMessage(err)} Nothing was saved — please try again.`, { cause: err, retryable: true });
      }
    },
    [modal.goal, createGoal, updateGoal, deleteGoal, createTask, removeTasksForGoals, clearTaskError],
  );

  const handleSubmit = useCallback(
    async (payload, draftTasks = []) => {
      try {
        await saveGoal(payload, draftTasks);
      } catch (err) {
        // The open form shows this failure; don't repeat it on the page behind the modal.
        clearActionError();
        throw err;
      }
      closeModal();
    },
    [saveGoal, clearActionError, closeModal],
  );

  const handleDelete = useCallback(
    (goal) => {
      const confirmed = window.confirm(`Delete “${goal.title}”? This cannot be undone. Its subgoals and tasks will be deleted too.`);
      if (confirmed) deleteGoal(goal.id).then(removeTasksForGoals).catch(() => {});
    },
    [deleteGoal, removeTasksForGoals],
  );

  const rowActions = {
    onEdit: openEdit,
    onToggleFavorite: (goal) => toggleFavorite(goal).catch(() => {}),
    onToggleComplete: (goal) => toggleComplete(goal).catch(() => {}),
    onDelete: handleDelete,
  };

  const subtitle = isLoading
    ? "Loading your goals…"
    : activeFilterCount > 0
      ? `${visibleCount} of ${totalCount} goals`
      : `${totalCount} ${totalCount === 1 ? "goal" : "goals"}`;

  return (
    <div className="flex h-full flex-col">
      <GoalsHeader
        subtitle={subtitle}
        lifeAreas={lifeAreas}
        view={view}
        activeFilterCount={activeFilterCount}
        onFiltersChange={setFilters}
        onResetView={resetView}
        onGroupingChange={setGrouping}
        onSortChange={toggleSort}
        onCreate={openCreate}
        onCreateWithRoadmap={() => setRoadmapWizardOpen(true)}
        onOpenSidebar={onOpenSidebar}
      />

      {(actionError || status === "error") && (
        <div className="px-4 pt-3 sm:px-5">
          {actionError && <Alert onDismiss={clearActionError}>{actionError}</Alert>}
          {status === "error" && (
            <Alert>
              Couldn’t load your goals. {error}{" "}
              <Button variant="ghost" size="sm" onClick={load} className="ml-1 underline">Retry</Button>
            </Alert>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <GoalsTable
          loading={isLoading}
          groups={groups}
          lifeAreaById={lifeAreaById}
          subgoalsByParent={subgoalsByParent}
          view={view}
          onSort={toggleSort}
          hasFilters={activeFilterCount > 0}
          onClearFilters={resetView}
          onCreate={openCreate}
          actions={rowActions}
        />
      </div>

      <GoalFormModal open={modal.open} goal={modal.goal} defaults={modal.defaults} lifeAreas={lifeAreas} onSubmit={handleSubmit} onClose={closeModal} />
      {roadmapWizardOpen && (
        <RoadmapWizard
          today={today}
          onClose={() => setRoadmapWizardOpen(false)}
          onCreateWithoutAi={(details) => {
            setRoadmapWizardOpen(false);
            setModal({ open: true, goal: null, defaults: details });
          }}
          onSaved={(goal) => {
            applySavedRoadmap(goal);
            setRoadmapWizardOpen(false);
            navigate(`/goals/${goal.id}?tab=roadmap`);
          }}
        />
      )}
    </div>
  );
}

export default GoalsPage;
