import { Link } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { ProgressBar } from "../../goals/components/dashboard/dashboardParts.jsx";
import { COLOR_HEX } from "../../goals/goals.constants.js";
import { DAY_STATUS, formatNumber, periodLabel, scheduleLabel, trackingLabel } from "../habits.logic.js";
import HabitIcon from "./HabitIcon.jsx";
import HabitLogControl from "./HabitLogControl.jsx";

/** A habit in the list: what it is, today's state and a quick way to log today. */
function HabitCard({ habit, onLog, onClear }) {
  const { today } = habit;
  const log = today.log;
  const percent = log?.progressPercent ?? 0;
  const hex = COLOR_HEX[habit.color] ?? "#4f46e5";
  const canLog = today.requirement !== "outside" && !habit.isArchived;

  let todayText;
  if (today.requirement === "outside") todayText = today.dateKey < habit.startDate ? "Starts later" : "Ended";
  else if (log) todayText = `${formatNumber(log.progressPercent)}% today`;
  else if (today.requirement === "rest") todayText = "Rest day";
  else todayText = DAY_STATUS.pending.label; // "Not logged yet"

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <HabitIcon icon={habit.icon} color={habit.color} />
        <div className="min-w-0 flex-1">
          <Link to={`/habits/${habit.id}`} className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-700">
            {habit.title}
          </Link>
          <p className="truncate text-xs text-slate-500">
            {scheduleLabel(habit.schedule)} · {trackingLabel(habit)}
          </p>
        </div>
        <span className={log?.progressPercent >= 100 ? "inline-flex items-center gap-1 text-xs font-medium text-green-700" : "text-xs text-slate-500"}>
          {log?.progressPercent >= 100 && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
          {todayText}
        </span>
      </div>

      {canLog && <ProgressBar value={percent} colorHex={percent >= 100 ? "#16a34a" : hex} label={`${habit.title}: today's progress`} />}
      <p className="text-xs text-slate-500">{periodLabel(habit)}</p>

      {canLog && today.requirement !== "rest" && (
        <HabitLogControl compact habit={habit} log={log} onSave={(entry) => onLog(habit, entry)} onClear={() => onClear(habit)} />
      )}
      {canLog && today.requirement === "rest" && (
        <p className="text-xs text-slate-500">
          Not scheduled today.{" "}
          <Link to={`/habits/${habit.id}`} className="font-medium text-brand-700 hover:underline">Log anyway</Link>
        </p>
      )}
    </article>
  );
}

export default HabitCard;
