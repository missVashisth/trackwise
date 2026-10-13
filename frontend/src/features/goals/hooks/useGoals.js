// Hooks layer: connects the goals API to the goals store and exposes
// intent-named actions for the UI.

import { useCallback, useEffect, useMemo } from "react";
import { goalsApi } from "../api/index.js";
import { ACTIONS } from "../state/goals.context.jsx";
import { useGoalsDispatch, useGoalsState } from "./useGoalsStore.js";
import { errorMessage } from "../../../lib/errors.js";

export function useGoals() {
  const { goals, lifeAreas, status, error, actionError } = useGoalsState();
  const dispatch = useGoalsDispatch();

  const load = useCallback(async () => {
    dispatch({ type: ACTIONS.LOAD_START });
    try {
      const [goalsResult, areasResult] = await Promise.all([goalsApi.listGoals(), goalsApi.listLifeAreas()]);
      dispatch({ type: ACTIONS.LOAD_SUCCESS, goals: goalsResult.goals ?? [], lifeAreas: areasResult.lifeAreas ?? [] });
    } catch (err) {
      dispatch({ type: ACTIONS.LOAD_ERROR, error: errorMessage(err) });
    }
  }, [dispatch]);

  // Wraps a mutation so failures land in the store instead of being swallowed.
  const runAction = useCallback(
    async (fn) => {
      dispatch({ type: ACTIONS.CLEAR_ACTION_ERROR });
      try {
        return await fn();
      } catch (err) {
        dispatch({ type: ACTIONS.ACTION_ERROR, error: errorMessage(err) });
        throw err;
      }
    },
    [dispatch],
  );

  const createGoal = useCallback(
    (payload) =>
      runAction(async () => {
        const { goal } = await goalsApi.createGoal(payload);
        dispatch({ type: ACTIONS.GOAL_ADDED, goal });
        return goal;
      }),
    [dispatch, runAction],
  );

  const updateGoal = useCallback(
    (id, patch) =>
      runAction(async () => {
        const { goal } = await goalsApi.updateGoal(id, patch);
        dispatch({ type: ACTIONS.GOAL_UPDATED, goal });
        return goal;
      }),
    [dispatch, runAction],
  );

  const deleteGoal = useCallback(
    (id) =>
      runAction(async () => {
        const { deletedGoalIds = [id] } = await goalsApi.deleteGoal(id);
        dispatch({ type: ACTIONS.GOAL_REMOVED, ids: deletedGoalIds.map(String) });
        return deletedGoalIds;
      }),
    [dispatch, runAction],
  );

  const toggleFavorite = useCallback((goal) => updateGoal(goal.id, { isFavorite: !goal.isFavorite }), [updateGoal]);

  const toggleComplete = useCallback(
    (goal) => updateGoal(goal.id, { completedAt: goal.completedAt ? null : new Date().toISOString() }),
    [updateGoal],
  );

  const clearActionError = useCallback(() => dispatch({ type: ACTIONS.CLEAR_ACTION_ERROR }), [dispatch]);

  const lifeAreaById = useMemo(() => new Map(lifeAreas.map((area) => [area.id, area])), [lifeAreas]);

  const favorites = useMemo(() => goals.filter((g) => g.isFavorite && !g.completedAt), [goals]);

  return {
    goals,
    lifeAreas,
    lifeAreaById,
    favorites,
    status,
    error,
    actionError,
    isLoading: status === "idle" || status === "loading",
    load,
    createGoal,
    updateGoal,
    deleteGoal,
    toggleFavorite,
    toggleComplete,
    clearActionError,
  };
}

/** Call once near the top of the app so data loads a single time. */
export function useLoadGoals() {
  const { status, load } = useGoals();
  useEffect(() => {
    if (status === "idle") load();
  }, [status, load]);
}
