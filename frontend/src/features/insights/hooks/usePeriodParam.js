import { useSearchParams } from "react-router";
import { periodFromParams, periodToParams } from "../insights.format.js";

/**
 * Period state shared through the URL (?period=week&date=… or ?period=custom&from=&to=).
 * Other parameters on the page (such as the detail tab, ?view=) are kept when the period changes.
 */
export function usePeriodParam() {
  const [params, setParams] = useSearchParams();
  const state = periodFromParams(params);
  const setState = (next) =>
    setParams((current) => {
      const kept = Object.fromEntries([...current].filter(([key]) => !["period", "date", "from", "to"].includes(key)));
      return { ...periodToParams(next), ...kept };
    });
  return [state, setState];
}

/** The detail-page tab (?view=), defaulting to the first one. */
export function useViewParam(ids) {
  const [params, setParams] = useSearchParams();
  const view = ids.includes(params.get("view")) ? params.get("view") : ids[0];
  const setView = (next) =>
    setParams((current) => {
      const copy = new URLSearchParams(current);
      if (next === ids[0]) copy.delete("view");
      else copy.set("view", next);
      return copy;
    });
  return [view, setView];
}
