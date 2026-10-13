// Hooks layer: connects the tasks API to the tasks store, and pushes the
// recalculated goal progress the backend returns into the goals store.

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { tasksApi, toTask } from "../api/tasks.api.js";
import { TASK_ACTIONS, TasksDispatchContext, TasksStateContext } from "../state/tasks.context.jsx";
import { ACTIONS as GOAL_ACTIONS } from "../../goals/state/goals.context.jsx";
import { useGoalsDispatch } from "../../goals/hooks/useGoalsStore.js";
import { currentAppDateKey } from "../../../lib/date.js";
import { goalsApi } from "../../goals/api/index.js";
import { errorMessage } from "../../../lib/errors.js";

export function useTasks() {
  const state = useContext(TasksStateContext);
  const dispatch = useContext(TasksDispatchContext);
  if (!state || !dispatch) throw new Error("useTasks must be used inside <TasksProvider>");
  const goalsDispatch = useGoalsDispatch();

  const { tasks, today, timeZone, status, error, actionError } = state;

  const load = useCallback(async () => {
    dispatch({ type: TASK_ACTIONS.LOAD_START });
    try {
      const result = await tasksApi.listTasks();
      dispatch({ type: TASK_ACTIONS.LOAD_SUCCESS, tasks: result.tasks, today: result.today, timeZone: result.timeZone });
    } catch (err) {
      dispatch({ type: TASK_ACTIONS.LOAD_ERROR, error: errorMessage(err) });
    }
  }, [dispatch]);

  const runAction = useCallback(
    async (fn) => {
      dispatch({ type: TASK_ACTIONS.CLEAR_ACTION_ERROR });
      try {
        return await fn();
      } catch (err) {
        dispatch({ type: TASK_ACTIONS.ACTION_ERROR, error: errorMessage(err) });
        throw err;
      }
    },
    [dispatch],
  );

  const applyGoalProgress = useCallback(
    (goalId, progress) => {
      if (progress) goalsDispatch({ type: GOAL_ACTIONS.GOAL_PROGRESS_UPDATED, goalId, progress });
    },
    [goalsDispatch],
  );

  // The change was saved but the server could not return fresh progress: fetch the goal instead.
  const refetchGoalProgress = useCallback(
    async (goalId) => {
      try {
        const goal = await goalsApi.getGoal?.(goalId);
        if (goal?.progress) applyGoalProgress(goalId, goal.progress);
      } catch {
        // Progress refreshes on the next load; the completion itself is already saved.
      }
    },
    [applyGoalProgress],
  );

  const createTask = useCallback(
    ({ goalId, ...payload }) =>
      runAction(async () => {
        if (!goalId) {
          const todo = await tasksApi.createTodo(payload);
          dispatch({ type: TASK_ACTIONS.ADDED, task: todo });
          return todo;
        }
        const { task, goalProgress } = await tasksApi.createTask(goalId, payload);
        dispatch({ type: TASK_ACTIONS.ADDED, task });
        applyGoalProgress(goalId, goalProgress);
        return task;
      }),
    [dispatch, runAction, applyGoalProgress],
  );

  const updateTask = useCallback(
    (task, patch) =>
      runAction(async () => {
        if (task.isTodo) {
          const todo = await tasksApi.updateTodo(task.id, patch);
          dispatch({ type: TASK_ACTIONS.UPDATED, task: todo });
          return todo;
        }
        const { task: updated, goalProgress } = await tasksApi.updateTask(task.goalId, task.id, patch, { isRoadmap: task.isRoadmap });
        dispatch({ type: TASK_ACTIONS.UPDATED, task: task.isRoadmap ? updated : { ...updated, completedToday: task.completedToday } });
        applyGoalProgress(task.goalId, goalProgress);
        return updated;
      }),
    [dispatch, runAction, applyGoalProgress],
  );

  const deleteTask = useCallback(
    (task) =>
      runAction(async () => {
        if (task.isTodo) {
          await tasksApi.deleteTodo(task.id);
          dispatch({ type: TASK_ACTIONS.REMOVED, id: task.id });
          return;
        }
        const { goalProgress } = await tasksApi.deleteTask(task.goalId, task.id);
        dispatch({ type: TASK_ACTIONS.REMOVED, id: task.id });
        applyGoalProgress(task.goalId, goalProgress);
      }),
    [dispatch, runAction, applyGoalProgress],
  );

  const toggleCompletedToday = useCallback(
    (task) =>
      runAction(async () => {
        if (task.isTodo) {
          const todo = await tasksApi.updateTodo(task.id, { completed: !task.completedToday });
          dispatch({ type: TASK_ACTIONS.UPDATED, task: todo });
          return;
        }
        // Roadmap tasks are done once, whatever the date: show it at once, then take the server's
        // version. If the request fails, reload so the list shows what is really stored.
        if (task.isRoadmap) {
          const completing = !task.completedAt;
          dispatch({
            type: TASK_ACTIONS.UPDATED,
            task: { id: task.id, completedAt: completing ? new Date().toISOString() : null, completedToday: completing, roadmapStatus: completing ? "completed" : task.roadmapStatus },
          });
          let result;
          try {
            result = completing ? await tasksApi.completeToday(task.goalId, task.id) : await tasksApi.reopen(task.goalId, task.id);
          } catch (err) {
            load();
            throw err;
          }
          dispatch({ type: TASK_ACTIONS.UPDATED, task: toTask(result.task) });
          if (result.goalProgress) applyGoalProgress(task.goalId, result.goalProgress);
          else refetchGoalProgress(task.goalId);
          return;
        }
        // The list was loaded on an earlier day (app left open past midnight): its ticks belong to
        // that day, and undoing one would delete yesterday's record. Refresh instead of acting.
        if (today !== currentAppDateKey(timeZone)) {
          await load();
          return;
        }
        let result;
        try {
          result = task.completedToday
            ? await tasksApi.undoComplete(task.goalId, task.id, today)
            : await tasksApi.completeToday(task.goalId, task.id);
        } catch (err) {
          // The server may have saved the change before failing (or a duplicate click raced it):
          // reload so the checkbox shows what is really stored, then report the error.
          load();
          throw err;
        }
        dispatch({ type: TASK_ACTIONS.UPDATED, task: { id: task.id, completedToday: !task.completedToday } });
        if (result.goalProgress) applyGoalProgress(task.goalId, result.goalProgress);
        else refetchGoalProgress(task.goalId);
      }),
    [dispatch, runAction, applyGoalProgress, refetchGoalProgress, today, timeZone, load],
  );

  const removeTasksForGoals = useCallback(
    (goalIds) => dispatch({ type: TASK_ACTIONS.GOALS_REMOVED, goalIds }),
    [dispatch],
  );

  const clearActionError = useCallback(() => dispatch({ type: TASK_ACTIONS.CLEAR_ACTION_ERROR }), [dispatch]);

  const tasksByGoal = useMemo(() => {
    const byGoal = new Map();
    for (const task of tasks) {
      if (task.isTodo) continue;
      if (!byGoal.has(task.goalId)) byGoal.set(task.goalId, []);
      byGoal.get(task.goalId).push(task);
    }
    return byGoal;
  }, [tasks]);

  const todos = useMemo(() => tasks.filter((t) => t.isTodo), [tasks]);

  return {
    tasks,
    todos,
    today,
    timeZone,
    status,
    error,
    actionError,
    isLoading: status === "idle" || status === "loading",
    tasksByGoal,
    load,
    createTask,
    updateTask,
    deleteTask,
    toggleCompletedToday,
    removeTasksForGoals,
    clearActionError,
  };
}

/**
 * Goal tasks reset every day. When the date changes while the app stays open, reload the task
 * list (fresh completedToday flags) and goals (isOngoing, today's progress).
 */
export function useReloadOnNewDay(reloadGoals) {
  const { today, timeZone, status, load } = useTasks();
  useEffect(() => {
    if (status !== "ready" || !today) return undefined;
    const reloadIfNewDay = () => {
      if (document.visibilityState === "visible" && currentAppDateKey(timeZone) !== today) {
        load();
        reloadGoals();
      }
    };
    const timer = setInterval(reloadIfNewDay, 60_000);
    window.addEventListener("focus", reloadIfNewDay);
    document.addEventListener("visibilitychange", reloadIfNewDay);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", reloadIfNewDay);
      document.removeEventListener("visibilitychange", reloadIfNewDay);
    };
  }, [today, timeZone, status, load, reloadGoals]);
}

/**
 * Tick / untick with one request per task at a time: a rapid second click would only hit the
 * backend's 409. Errors are shown via actionError. Returns [handleToggle, pendingIds].
 */
export function useTaskToggle() {
  const { toggleCompletedToday } = useTasks();
  const pendingRef = useRef(new Set());
  const [pendingIds, setPendingIds] = useState(() => new Set());

  const handleToggle = useCallback(
    async (task) => {
      if (pendingRef.current.has(task.id)) return;
      pendingRef.current.add(task.id);
      setPendingIds(new Set(pendingRef.current));
      try {
        await toggleCompletedToday(task);
      } catch {
        // shown via actionError
      } finally {
        pendingRef.current.delete(task.id);
        setPendingIds(new Set(pendingRef.current));
      }
    },
    [toggleCompletedToday],
  );

  return [handleToggle, pendingIds];
}

/** Call once near the top of the app so tasks load a single time. */
export function useLoadTasks() {
  const { status, load } = useTasks();
  useEffect(() => {
    if (status === "idle") load();
  }, [status, load]);
}
