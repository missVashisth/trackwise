import { ArrowDown, ArrowUp } from "lucide-react";
import { GOAL_COLUMNS } from "../goals.constants.js";
import { cn } from "../../../lib/cn.js";
import { DESKTOP_ONLY, GOAL_GRID } from "./goalGrid.js";

const ALWAYS_VISIBLE = new Set(["title", "progress"]);

function GoalsTableHeader({ sortKey, sortDir, onSort }) {
  return (
    <div role="row" className={cn(GOAL_GRID, "border-b border-slate-200 px-4 py-2")}>
      {GOAL_COLUMNS.map((column) => {
        const active = sortKey === column.key;
        const SortIcon = sortDir === "desc" ? ArrowDown : ArrowUp;

        return (
          <button
            key={column.key}
            type="button"
            onClick={() => column.sortable && onSort(column.key)}
            className={cn(
              "items-center gap-1 text-left text-xs font-medium text-slate-500 hover:text-slate-800",
              ALWAYS_VISIBLE.has(column.key) ? "flex" : DESKTOP_ONLY,
              active && "text-slate-900",
            )}
            aria-sort={active ? (sortDir === "desc" ? "descending" : "ascending") : "none"}
          >
            {column.label}
            {active && <SortIcon className="h-3 w-3" aria-hidden="true" />}
          </button>
        );
      })}
      <span aria-hidden="true" />
    </div>
  );
}

export default GoalsTableHeader;
