// Hooks layer for habits. Habit data is only needed on the habit pages, so it is fetched there
// (no app-wide store). Lists reload when the user's day changes (the tasks store tracks "today").

import { useCallback, useEffect, useRef, useState } from "react";
import { habitsApi } from "../api/habits.api.js";
import { useTasks } from "../../tasks/hooks/useTasks.js";
import { errorMessage } from "../../../lib/errors.js";

/**
 * A counter that changes when the user's day rolls over (one known date -> another), but not when
 * the task store first reports today's date — that would refetch everything right after loading.
 */
function useDayRollover() {
  const { today } = useTasks();
  const known = useRef(today);
  const [rollovers, setRollovers] = useState(0);
  useEffect(() => {
    if (known.current && today && today !== known.current) setRollovers((n) => n + 1);
    if (today) known.current = today;
  }, [today]);
  return rollovers;
}

/** The user's habits for a status (active | archived | all). */
export function useHabitList(status = "active") {
  const dayRollover = useDayRollover();
  const [state, setState] = useState({ habits: [], today: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    habitsApi.list(status).then(
      ({ habits, today }) => current && setState({ habits, today, loading: false, error: null }),
      (err) => current && setState((s) => ({ ...s, loading: false, error: errorMessage(err) })),
    );
    return () => {
      current = false;
    };
  }, [status, dayRollover, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  /** Put a habit returned by a mutation into the list (or drop it when it left this list). */
  const replace = useCallback(
    (habit) =>
      setState((s) => ({
        ...s,
        habits: s.habits.flatMap((h) => {
          if (h.id !== habit.id) return [h];
          const belongs = status === "all" || (status === "archived") === Boolean(habit.isArchived);
          return belongs ? [habit] : [];
        }),
      })),
    [status],
  );

  return { ...state, reload, replace };
}

/** One habit plus its recent history. */
export function useHabit(habitId, { historyDays = 30 } = {}) {
  const dayRollover = useDayRollover();
  const [state, setState] = useState({ habit: null, history: null, today: null, loading: true, error: null, notFound: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([habitsApi.get(habitId), habitsApi.history(habitId)]).then(
      ([{ habit, today }, history]) => current && setState({ habit, history, today, loading: false, error: null, notFound: false }),
      (err) => current && setState((s) => ({ ...s, loading: false, error: errorMessage(err), notFound: Boolean(err?.isNotFound) })),
    );
    return () => {
      current = false;
    };
  }, [habitId, dayRollover, attempt, historyDays]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setHabit = useCallback((habit) => setState((s) => ({ ...s, habit })), []);

  return { ...state, reload, setHabit };
}
