// State layer: a reducer-backed store for goals data and the user's view
// preferences (grouping / sort / filters). No API calls and no derived
// data live here — hooks handle those.

import { createContext, useEffect, useReducer } from "react";
import { GROUPING, STATUS_FILTER } from "../goals.constants.js";
import { readStorage, writeStorage } from "../../../lib/storage.js";

const VIEW_STORAGE_KEY = "goalTracker.goals.view.v1";

export const DEFAULT_VIEW = {
  grouping: GROUPING.LIFE_AREA,
  sortKey: "deadline",
  sortDir: "asc",
  filters: { status: STATUS_FILTER.ACTIVE, lifeAreaIds: [], impacts: [] },
};

export const ACTIONS = {
  LOAD_START: "goals/loadStart",
  LOAD_SUCCESS: "goals/loadSuccess",
  LOAD_ERROR: "goals/loadError",
  GOAL_ADDED: "goals/added",
  GOAL_UPDATED: "goals/updated",
  GOAL_REMOVED: "goals/removed",
  GOAL_PROGRESS_UPDATED: "goals/progressUpdated",
  ACTION_ERROR: "goals/actionError",
  CLEAR_ACTION_ERROR: "goals/clearActionError",
  SET_VIEW: "goals/setView",
  SET_FILTERS: "goals/setFilters",
  RESET_VIEW: "goals/resetView",
};

function loadInitialView() {
  const stored = readStorage(VIEW_STORAGE_KEY);
  if (!stored) return DEFAULT_VIEW;
  return {
    ...DEFAULT_VIEW,
    ...stored,
    filters: { ...DEFAULT_VIEW.filters, ...(stored.filters ?? {}) },
  };
}

function createInitialState() {
  return {
    goals: [],
    lifeAreas: [],
    status: "idle", // idle | loading | ready | error
    error: null,
    actionError: null,
    view: loadInitialView(),
  };
}

export function goalsReducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOAD_START:
      return { ...state, status: "loading", error: null };
    case ACTIONS.LOAD_SUCCESS:
      return { ...state, status: "ready", goals: action.goals, lifeAreas: action.lifeAreas };
    case ACTIONS.LOAD_ERROR:
      return { ...state, status: "error", error: action.error };
    case ACTIONS.GOAL_ADDED:
      return { ...state, goals: [...state.goals, action.goal] };
    case ACTIONS.GOAL_UPDATED:
      return { ...state, goals: state.goals.map((g) => (g.id === action.goal.id ? action.goal : g)) };
    case ACTIONS.GOAL_REMOVED: {
      // The backend reports every goal it deleted (the goal and all its subgoals).
      const removed = new Set(action.ids);
      return { ...state, goals: state.goals.filter((g) => !removed.has(g.id)) };
    }
    case ACTIONS.GOAL_PROGRESS_UPDATED:
      return {
        ...state,
        goals: state.goals.map((g) => (g.id === action.goalId ? { ...g, progress: action.progress } : g)),
      };
    case ACTIONS.ACTION_ERROR:
      return { ...state, actionError: action.error };
    case ACTIONS.CLEAR_ACTION_ERROR:
      return { ...state, actionError: null };
    case ACTIONS.SET_VIEW:
      return { ...state, view: { ...state.view, ...action.view } };
    case ACTIONS.SET_FILTERS:
      return { ...state, view: { ...state.view, filters: { ...state.view.filters, ...action.filters } } };
    case ACTIONS.RESET_VIEW:
      return { ...state, view: DEFAULT_VIEW };
    default:
      return state;
  }
}

export const GoalsStateContext = createContext(null);
export const GoalsDispatchContext = createContext(null);

export function GoalsProvider({ children }) {
  const [state, dispatch] = useReducer(goalsReducer, undefined, createInitialState);

  useEffect(() => {
    writeStorage(VIEW_STORAGE_KEY, state.view);
  }, [state.view]);

  return (
    <GoalsStateContext.Provider value={state}>
      <GoalsDispatchContext.Provider value={dispatch}>{children}</GoalsDispatchContext.Provider>
    </GoalsStateContext.Provider>
  );
}
