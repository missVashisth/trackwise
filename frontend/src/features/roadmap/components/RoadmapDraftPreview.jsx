import { CalendarRange, Clock, Layers, ListChecks } from "lucide-react";
import { formatLongDate, formatShortDate } from "../../../lib/date.js";
import { formatMinutes } from "../roadmap.selectors.js";

/** Read-only view of an unsaved roadmap draft: summary, phases and expandable days. */
function RoadmapDraftPreview({ draft }) {
  const { goal, days, phases } = draft;
  const minutesPerDay = days.map((d) => d.tasks.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0));
  const average = minutesPerDay.length ? Math.round(minutesPerDay.reduce((a, b) => a + b, 0) / minutesPerDay.length) : 0;

  return (
    <div className="flex flex-col gap-4">
      {draft.summary && <p className="text-sm text-slate-700">{draft.summary}</p>}

      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          [CalendarRange, "Duration", `${goal.totalDays} days`],
          [CalendarRange, "Dates", `${formatShortDate(goal.startDate)} – ${formatShortDate(goal.endDate)}`],
          [ListChecks, "Tasks", draft.totalTasks],
          [Clock, "Per day", average ? `~${formatMinutes(average)}` : "—"],
        ].map(([Icon, label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
            <dt className="flex items-center gap-1 text-slate-500">
              <Icon className="h-3 w-3" aria-hidden="true" />
              {label}
            </dt>
            <dd className="mt-0.5 font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      {phases.length > 0 && (
        <div>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Phases
          </h3>
          <ol className="flex flex-col gap-1.5">
            {phases.map((phase) => (
              <li key={`${phase.startDay}-${phase.title}`} className="text-sm">
                <span className="font-medium text-slate-800">{phase.title}</span>
                <span className="text-slate-500"> · days {phase.startDay}–{phase.endDay}</span>
                {phase.description && <span className="block text-xs text-slate-500">{phase.description}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Day by day</h3>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {days.map((day, index) => (
            <details key={day.day} open={index === 0} className="group px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">Day {day.day}</span>
                  <span className="text-slate-500"> · {formatLongDate(day.date)}</span>
                  {day.focus && <span className="block truncate text-xs text-slate-500">{day.focus}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {day.tasks.length} {day.tasks.length === 1 ? "task" : "tasks"}
                  <span className="ml-1 inline-block transition group-open:rotate-90" aria-hidden="true">›</span>
                </span>
              </summary>
              <ul className="mt-2 flex flex-col gap-2 pb-1">
                {day.tasks.map((task) => (
                  <li key={task.itemId} className="rounded-md bg-slate-50 px-2.5 py-2">
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{task.title}</span>
                      {task.estimatedMinutes && <span className="shrink-0 text-xs text-slate-500">{formatMinutes(task.estimatedMinutes)}</span>}
                    </div>
                    {task.description && <p className="mt-0.5 text-xs text-slate-600">{task.description}</p>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RoadmapDraftPreview;
