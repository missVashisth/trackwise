// Hooks layer for one goal's dashboard history (GET /api/goals/:id/insights). The data is only
// needed by the goal dashboard, so it lives here rather than in the app-wide goals store.

import { useCallback, useEffect, useState } from "react";
import { goalsApi } from "../api/index.js";
import { errorMessage, UserMessageError } from "../../../lib/errors.js";

const fetchInsights = (goalId) =>
  goalsApi.getInsights ? goalsApi.getInsights(goalId) : Promise.reject(new UserMessageError("Goal history is not available in mock mode."));

/**
 * Loads the goal's insights while `enabled`, and again whenever `refreshKey` changes (the goal's
 * progress, its tasks or the user's day changed). Earlier data stays visible while refreshing;
 * a response that arrives after a newer request started is ignored.
 */
export function useGoalInsights(goalId, { enabled = true, refreshKey = "" } = {}) {
  const [result, setResult] = useState({ goalId: null, data: null, error: null, notFound: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !goalId) return undefined;
    let current = true;
    fetchInsights(goalId).then(
      (data) => {
        if (current) setResult({ goalId, data, error: null, notFound: false });
      },
      (err) => {
        if (!current) return;
        setResult((prev) => ({
          goalId,
          data: prev.goalId === goalId ? prev.data : null,
          error: errorMessage(err),
          notFound: err.status === 404,
        }));
      },
    );
    return () => {
      current = false;
    };
  }, [enabled, goalId, refreshKey, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Never show another goal's data (or error) after navigating between goals.
  const own = result.goalId === goalId;
  const data = own ? result.data : null;
  const error = own ? result.error : null;

  return {
    insights: data,
    error,
    notFound: own && result.notFound,
    isLoading: !data && !error,
    reload,
  };
}
