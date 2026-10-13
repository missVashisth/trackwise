// State layer for tasks. No API calls here — hooks handle those.

import { createContext, useReducer } from "react";

export const TASK_ACTIONS = {
  LOAD_START: "tasks/loadStart",
  LOAD_SUCCESS: "tasks/loadSuccess",
  LOAD_ERROR: "tasks/loadError",
  ADDED: "tasks/added",
  UPDATED: "tasks/updated",
  REMOVED: "tasks/removed",
  GOALS_REMOVED: "tasks/goalsRemoved",
  ACTION_ERROR: "tasks/actionError",
  CLEAR_ACTION_ERROR: "tasks/clearActionError",
};

const initialState = {
  tasks: [],
  today: null, // backend date key ("YYYY-MM-DD") that completions are recorded under
  timeZone: null, // the user's IANA zone that "today" is computed in
  status: "idle", // idle | loading | ready | error
  error: null,
  actionError: null,
};

function tasksReducer(state, action) {
  switch (action.type) {
    case TASK_ACTIONS.LOAD_START:
      return { ...state, status: "loading", error: null };
    case TASK_ACTIONS.LOAD_SUCCESS:
      return { ...state, status: "ready", tasks: action.tasks, today: action.today, timeZone: action.timeZone };
    case TASK_ACTIONS.LOAD_ERROR:
      return { ...state, status: "error", error: action.error };
    case TASK_ACTIONS.ADDED:
      return { ...state, tasks: [...state.tasks, action.task] };
    case TASK_ACTIONS.UPDATED:
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.task.id ? { ...t, ...action.task } : t)),
      };
    case TASK_ACTIONS.REMOVED:
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };
    case TASK_ACTIONS.GOALS_REMOVED: {
      const goalIds = new Set(action.goalIds);
      return { ...state, tasks: state.tasks.filter((t) => !goalIds.has(t.goalId)) };
    }
    case TASK_ACTIONS.ACTION_ERROR:
      return { ...state, actionError: action.error };
    case TASK_ACTIONS.CLEAR_ACTION_ERROR:
      return { ...state, actionError: null };
    default:
      return state;
  }
}

export const TasksStateContext = createContext(null);
export const TasksDispatchContext = createContext(null);

export function TasksProvider({ children }) {
  const [state, dispatch] = useReducer(tasksReducer, initialState);

  return (
    <TasksStateContext.Provider value={state}>
      <TasksDispatchContext.Provider value={dispatch}>{children}</TasksDispatchContext.Provider>
    </TasksStateContext.Provider>
  );
}
