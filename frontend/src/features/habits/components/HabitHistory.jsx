// The last days of a habit, one cell per day, from the API's day statuses. Days without a log are
// shown by meaning (missed, rest, not logged yet), never stored.

import { cn } from "../../../lib/cn.js";
import { formatShortDate } from "../../../lib/date.js";
import { COLOR_HEX } from "../../goals/goals.constants.js";
import { DAY_STATUS, formatNumber } from "../habits.logic.js";

const LEGEND = ["done", "partial", "missed", "rest", "pending"];

function cellStyle(day, hex) {
  if (day.status === "done") return { backgroundColor: hex };
  if (day.status === "partial") return { backgroundColor: hex, opacity: 0.25 + (day.progressPercent / 100) * 0.6 };
  return undefined;
}

const CELL_CLASS = {
  zero: "bg-slate-300",
  missed: "bg-red-100 ring-1 ring-inset ring-red-200",
  rest: "bg-slate-50 ring-1 ring-inset ring-slate-200",
  open: "bg-slate-100",
  pending: "bg-white ring-2 ring-inset ring-brand-400",
  future: "bg-white ring-1 ring-inset ring-dashed ring-slate-200",
  outside: "bg-transparent",
};

function HabitHistory({ days, color, unit }) {
  const hex = COLOR_HEX[color] ?? "#4f46e5";
  const logged = [...days].reverse().filter((d) => d.progressPercent !== null);

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-10 gap-1.5 sm:grid-cols-15" aria-label="Daily history">
        {days.map((day) => (
          <li key={day.dateKey} className="flex flex-col items-center gap-0.5">
            <span
              className={cn("h-7 w-full rounded-md", CELL_CLASS[day.status])}
              style={cellStyle(day, hex)}
              title={`${formatShortDate(day.dateKey)}: ${DAY_STATUS[day.status]?.label}${day.progressPercent !== null ? ` · ${formatNumber(day.progressPercent)}%` : ""}`}
            />
            <span className="text-[10px] text-slate-400">{Number(day.dateKey.slice(8))}</span>
          </li>
        ))}
      </ol>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {LEGEND.map((status) => (
          <li key={status} className="inline-flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-sm", CELL_CLASS[status])} style={cellStyle({ status, progressPercent: 50 }, hex)} />
            {DAY_STATUS[status].label}
          </li>
        ))}
      </ul>

      {logged.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {logged.slice(0, 10).map((day) => (
            <li key={day.dateKey} className="flex items-start gap-3 px-3 py-2 text-sm">
              <span className="w-16 shrink-0 text-slate-500">{formatShortDate(day.dateKey)}</span>
              <span className="w-28 shrink-0 font-medium text-slate-800">
                {formatNumber(day.progressPercent)}%
                {day.actualValue !== null && <span className="font-normal text-slate-500"> · {formatNumber(day.actualValue)} {unit}</span>}
              </span>
              <span className="min-w-0 flex-1 text-slate-600">{day.note}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nothing logged in this period yet.</p>
      )}
    </div>
  );
}

export default HabitHistory;
