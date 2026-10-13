import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState, Skeleton } from "../../../../components/ui/index.js";
import { cn } from "../../../../lib/cn.js";
import { formatLongDate, formatShortDate } from "../../../../lib/date.js";
import { CumulativeChart, DailyBarChart, DayDots, RoadmapProgressChart } from "./charts.jsx";
import { Card } from "./dashboardParts.jsx";
import { formatPoints, plural } from "./dashboard.utils.js";

const RANGES = [
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
];

function Legend({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {items.map(({ label, swatch }) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          {swatch}
          {label}
        </li>
      ))}
    </ul>
  );
}

function ConsistencyTable({ stats }) {
  const rows = [
    ["Days with tasks", (s) => s.trackedDays],
    ["Days with progress", (s) => s.activeDays],
    ["All tasks done", (s) => s.fullDays],
    ["Nothing done", (s) => s.missedDays],
    ["Consistency", (s) => (s.consistency == null ? "—" : `${s.consistency}%`)],
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500">
          <th scope="col" className="pb-2 text-left font-medium"><span className="sr-only">Measure</span></th>
          <th scope="col" className="pb-2 text-right font-medium">Last 7 days</th>
          <th scope="col" className="pb-2 text-right font-medium">Since start</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(([label, pick], i) => (
          <tr key={label} className={cn(i === rows.length - 1 && "font-semibold text-slate-900")}>
            <th scope="row" className="py-2 text-left font-normal text-slate-600">{label}</th>
            <td className="py-2 text-right tabular-nums">{pick(stats.last7Days)}</td>
            <td className="py-2 text-right tabular-nums">{pick(stats.sinceStart)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GoalProgressTab({ goal, status, colorHex, insights, isLoading, error, onRetry }) {
  const [range, setRange] = useState(14);

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
      </div>
    );
  }
  if (!insights) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="Couldn’t load progress history"
          description={error}
          action={<button type="button" onClick={onRetry} className="text-sm font-medium text-brand-700 hover:underline">Try again</button>}
        />
      </Card>
    );
  }

  const { series, stats, timeline, tasks, undated, roadmap } = insights;

  if (series.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="No history yet"
          description={
            status === "upcoming"
              ? `This goal starts on ${formatLongDate(timeline.startDate)}. Its daily progress will be charted from then.`
              : "Progress will be charted once the goal has days to show."
          }
        />
      </Card>
    );
  }

  const recentDays = series.slice(-range);
  const dailyMax = 100 / goal.totalDays;
  // Daily-tick charts only mean something when the goal has (or had) recurring tasks.
  const hasDaily = tasks.length > 0 || series.some((d) => d.outcome !== "noTasks");

  const roadmapCard = roadmap && (
    <Card
      title="Roadmap progress"
      description="Tasks completed so far against tasks planned up to each day. Overall progress = completed ÷ all roadmap tasks."
    >
      <RoadmapProgressChart series={roadmap.series} total={roadmap.total} colorHex={colorHex} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Legend
          items={[
            { label: `Completed (${roadmap.completed} of ${roadmap.total})`, swatch: <span className="h-0.5 w-4 rounded" style={{ backgroundColor: colorHex }} /> },
            { label: `Planned up to today (${roadmap.plannedThroughToday})`, swatch: <span className="w-4 border-t-2 border-dashed border-slate-400" /> },
          ]}
        />
        <p className="text-xs text-slate-500">
          {roadmap.pending} overdue · {roadmap.today} due today · {roadmap.upcoming} upcoming
        </p>
      </div>
    </Card>
  );

  // A roadmap-only goal shows just its roadmap; a goal without any tasks keeps the daily layout,
  // whose empty states explain that there is nothing to chart yet.
  if (roadmap && !hasDaily) return <div className="flex flex-col gap-4">{roadmapCard}</div>;

  return (
    <div className="flex flex-col gap-4">
      {roadmapCard}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={roadmap ? "Daily-task progress over time" : "Overall progress over time"}
          description={`Cumulative, from ${formatShortDate(series[0].dateKey)}${insights.seriesTruncated ? " (last 365 days)" : ""}. Each fully done day adds ${formatPoints(dailyMax)}%.`}
        >
          <CumulativeChart series={series} startDate={timeline.startDate} totalDays={goal.totalDays} colorHex={colorHex} />
          <div className="mt-2">
            <Legend
              items={[
                { label: `Actual (${formatPoints(insights.progress.overall)}%)`, swatch: <span className="h-0.5 w-4 rounded" style={{ backgroundColor: colorHex }} /> },
                { label: `Every task, every day (${Math.round(timeline.idealProgress)}%)`, swatch: <span className="w-4 border-t-2 border-dashed border-slate-400" /> },
              ]}
            />
          </div>
          {undated.records > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Includes {formatPoints(undated.progress)}% from {plural(undated.records, "older record")} saved without a date; it is counted from the first day.
            </p>
          )}
        </Card>

        <Card
          title="Daily completion"
          description="Share of each day’s task weight that was done. Today is still in progress."
          action={
            series.length > 14 && (
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Chart range">
                {RANGES.map((option) => (
                  <button
                    key={option.days}
                    type="button"
                    aria-pressed={range === option.days}
                    onClick={() => setRange(option.days)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium",
                      range === option.days ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )
          }
        >
          <DailyBarChart days={recentDays} colorHex={colorHex} />
          <div className="mt-2">
            <Legend
              items={[
                { label: "All done", swatch: <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorHex }} /> },
                { label: "Partly done", swatch: <span className="h-2.5 w-2.5 rounded-sm opacity-60" style={{ backgroundColor: colorHex }} /> },
                { label: "Nothing done", swatch: <span className="h-0.5 w-2.5 rounded-sm bg-slate-300" /> },
                { label: "No tasks yet", swatch: <span className="h-1 w-1 rounded-full bg-slate-300" /> },
              ]}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card
          className="lg:col-span-2"
          title="Consistency"
          description="Finished days only — today counts once it ends. Days before the goal had any task are left out."
        >
          <ConsistencyTable stats={stats} />
        </Card>

        <Card className="lg:col-span-3" title="Task history" description={`Each task over the last ${plural(tasks[0]?.recent.length ?? 0, "day")} of the goal`}>
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">This goal has no tasks yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {tasks.map((task) => (
                <li key={task.taskId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium text-slate-800">{task.title}</span>
                  <DayDots days={task.recent} colorHex={colorHex} />
                  <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                    {plural(task.totalCompletions, "day")} total
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export default GoalProgressTab;
