import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../../../lib/errors.js";

/**
 * Loads something whenever `key` changes; a slower, superseded response is ignored.
 * Returns { data, error, notFound, loading, reload, setData }.
 */
export function useResource(load, key) {
  const [state, setState] = useState({ data: null, error: null, notFound: false, loading: true });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => current && setState({ data, error: null, notFound: false, loading: false }),
      (err) => current && setState((s) => ({ ...s, loading: false, error: errorMessage(err), notFound: Boolean(err?.isNotFound) })),
    );
    return () => {
      current = false;
    };
    // `load` changes with `key`; key is the explicit dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback((data) => setState((s) => ({ ...s, data: typeof data === "function" ? data(s.data) : data })), []);
  return { ...state, reload, setData };
}
