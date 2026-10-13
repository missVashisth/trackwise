// Which task groups on a page are expanded. A group the user never toggled follows the default:
// expanded while it still has open tasks, collapsed once everything in it is done. Choices the
// user makes are remembered per user and page (localStorage), so they survive navigation and reloads.

import { useCallback, useRef, useState } from "react";
import { readStorage, writeStorage } from "../../../lib/storage.js";

const hasOpenTasks = (tasks) => tasks.some((task) => !task.completedToday);

export function useCollapsedGroups(storageKey, { defaultExpanded = hasOpenTasks } = {}) {
  const [choices, setChoices] = useState(() => (storageKey ? readStorage(storageKey, {}) : {}) ?? {});

  const save = useCallback(
    (next) => {
      setChoices(next);
      if (storageKey) writeStorage(storageKey, next);
    },
    [storageKey],
  );

  // The default is decided the first time a group is shown on this visit and then kept, so ticking
  // a group's last task doesn't make it collapse under the cursor.
  const defaults = useRef(new Map());
  const defaultFor = useCallback((id, tasks) => {
    if (!defaults.current.has(id)) defaults.current.set(id, defaultExpanded(tasks));
    return defaults.current.get(id);
  }, [defaultExpanded]);

  const isExpanded = useCallback((id, tasks) => (id in choices ? choices[id] : defaultFor(id, tasks)), [choices, defaultFor]);

  const toggle = useCallback((id, tasks) => save({ ...choices, [id]: !isExpanded(id, tasks) }), [choices, save, isExpanded]);

  /** Expand (true) or collapse (false) every listed group. */
  const setAll = useCallback((ids, expanded) => save({ ...choices, ...Object.fromEntries(ids.map((id) => [id, expanded])) }), [choices, save]);

  return { isExpanded, toggle, setAll };
}
