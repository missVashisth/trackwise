import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../../../lib/errors.js";

/**
 * Loads an Insights report whenever `key` changes (period or selected goal/habit). The previous
 * report stays visible while the next one loads; a slow, superseded response is ignored.
 */
export function useInsightsReport(load, key) {
  const [state, setState] = useState({ data: null, error: null, loading: true, notFound: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    load().then(
      (data) => current && setState({ data, error: null, loading: false, notFound: false }),
      (err) => current && setState((s) => ({ ...s, error: errorMessage(err), loading: false, notFound: Boolean(err?.isNotFound) })),
    );
    return () => {
      current = false;
    };
    // `load` changes with `key`; key is the explicit dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
