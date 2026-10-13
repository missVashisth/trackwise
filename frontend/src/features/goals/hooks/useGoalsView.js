// Derives the grouped / sorted / filtered list from raw goals + view prefs.

import { useCallback, useMemo } from "react";
import { ACTIONS } from "../state/goals.context.jsx";
import { filterGoals, groupGoals, indexSubgoals, isTopLevel, sortGoals } from "../goals.selectors.js";
import { useGoalsDispatch, useGoalsState } from "./useGoalsStore.js";

export function useGoalsView(goals, lifeAreas) {
  const { view } = useGoalsState();
  const dispatch = useGoalsDispatch();

  const topLevel = useMemo(() => goals.filter(isTopLevel), [goals]);

  const visible = useMemo(
    () => sortGoals(filterGoals(topLevel, view.filters), view.sortKey, view.sortDir),
    [topLevel, view.filters, view.sortKey, view.sortDir],
  );

  const groups = useMemo(() => groupGoals(visible, view.grouping, lifeAreas), [visible, view.grouping, lifeAreas]);

  const subgoalsByParent = useMemo(() => indexSubgoals(goals), [goals]);

  const setGrouping = useCallback((grouping) => dispatch({ type: ACTIONS.SET_VIEW, view: { grouping } }), [dispatch]);

  const toggleSort = useCallback(
    (sortKey) => {
      const sortDir = view.sortKey === sortKey && view.sortDir === "asc" ? "desc" : "asc";
      dispatch({ type: ACTIONS.SET_VIEW, view: { sortKey, sortDir } });
    },
    [dispatch, view.sortKey, view.sortDir],
  );

  const setFilters = useCallback((filters) => dispatch({ type: ACTIONS.SET_FILTERS, filters }), [dispatch]);

  const resetView = useCallback(() => dispatch({ type: ACTIONS.RESET_VIEW }), [dispatch]);

  const activeFilterCount =
    view.filters.lifeAreaIds.length + view.filters.impacts.length + (view.filters.status !== "active" ? 1 : 0);

  return {
    view,
    groups,
    subgoalsByParent,
    visibleCount: visible.length,
    totalCount: topLevel.length,
    activeFilterCount,
    setGrouping,
    toggleSort,
    setFilters,
    resetView,
  };
}
