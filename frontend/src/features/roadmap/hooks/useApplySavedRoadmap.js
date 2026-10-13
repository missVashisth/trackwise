import { useCallback } from "react";
import { ACTIONS as GOAL_ACTIONS } from "../../goals/state/goals.context.jsx";
import { useGoalsDispatch, useGoalsState } from "../../goals/hooks/useGoalsStore.js";
import { useTasks } from "../../tasks/hooks/useTasks.js";

/** After a roadmap is confirmed: put the goal in the goals store and load its new tasks. */
export function useApplySavedRoadmap() {
  const { goals } = useGoalsState();
  const goalsDispatch = useGoalsDispatch();
  const { load: loadTasks } = useTasks();

  return useCallback(
    (goal) => {
      const known = goals.some((g) => g.id === goal.id);
      goalsDispatch({ type: known ? GOAL_ACTIONS.GOAL_UPDATED : GOAL_ACTIONS.GOAL_ADDED, goal });
      loadTasks();
    },
    [goals, goalsDispatch, loadTasks],
  );
}
