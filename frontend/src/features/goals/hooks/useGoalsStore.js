import { useContext } from "react";
import { GoalsDispatchContext, GoalsStateContext } from "../state/goals.context.jsx";

export function useGoalsState() {
  const state = useContext(GoalsStateContext);
  if (!state) throw new Error("useGoalsState must be used inside <GoalsProvider>");
  return state;
}

export function useGoalsDispatch() {
  const dispatch = useContext(GoalsDispatchContext);
  if (!dispatch) throw new Error("useGoalsDispatch must be used inside <GoalsProvider>");
  return dispatch;
}
