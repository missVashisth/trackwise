// /insights/goals/:goalId — one goal, with focused sub-tabs (?view=summary|progress|consistency|activity).

import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Select } from "../../../components/ui/index.js";
import { formatLongDate } from "../../../lib/date.js";
import { COLOR_HEX } from "../../goals/goals.constants.js";
import { insightsApi } from "../api/insights.api.js";
import { useInsightsReport } from "../hooks/useInsightsReport.js";
import { useViewParam } from "../hooks/usePeriodParam.js";
import { formatPercent, shortDay } from "../insights.format.js";
import { progressSegments } from "../insights.charts.js";
import { ReportGate } from "../components/InsightsShell.jsx";
import { CalendarHeatmap, EmptyNote, InsightList, MetricCard, Section, StatusPill, SubTabs } from "../components/InsightParts.jsx";
import { AmountTrendChart, DailyCompletionChart, ProgressChart, TrendLineChart, WeekdayChart } from "../components/InsightCharts.jsx";

const VIEWS = [
  { id: "summary", label: "Summary" },
  { id: "progress", label: "Progress" },
  { id: "consistency", label: "Consistency" },
  { id: "activity", label: "Activity" },
];

// Observations already shown as headline numbers are not repeated in the text.
const REPEATS_CARDS = new Set(["progress", "tasks"]);

function Summary({ data }) {
  const g = data.goal;
  const c = g.current;
  const n = data.narrative;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard primary label="Overall progress" value={formatPercent(g.overallProgress)} detail={g.health.reason} definition={data.definitions.overallGoalProgress} />
        <MetricCard
          label="This period"
          value={`${c.progressMade > 0 ? "+" : ""}${c.progressMade} pts`}
          detail={`${g.previous.progressMade} pts in the previous period`}
          definition={data.definitions.progressMade}
        />
        <MetricCard
          label="Tasks completed"
          value={c.scheduled ? `${c.completed} of ${c.scheduled}` : "—"}
          detail={c.scheduled ? `${formatPercent(c.completionRate)} of scheduled${c.pendingToday ? ` · ${c.pendingToday} open today` : ""}` : "nothing scheduled yet"}
          definition={data.definitions.taskCompletionRate}
          change={g.change.completionRate}
        />
      </div>
      <Section title="What stands out">
        {n.hasData ? (
          <div className="grid gap-5 md:grid-cols-2">
            <InsightList items={[...n.observations.filter((o) => !REPEATS_CARDS.has(o.id)), ...n.weaknesses, ...n.strengths].slice(0, 2)} icon={Sparkles} tone="text-brand-500" empty="Nothing unusual in this period." />
            {n.recommendations[0] && (
              <div className="rounded-xl bg-amber-50/70 p-4 text-sm text-slate-700">
                <p className="mb-1 text-xs font-semibold text-amber-800">Suggestion</p>
                {n.recommendations[0].text}
              </div>
            )}
          </div>
        ) : (
          <EmptyNote>{n.message}</EmptyNote>
        )}
      </Section>
    </>
  );
}

function Progress({ data, unit }) {
  const g = data.goal;
  const seg = progressSegments(g.series);
  const color = COLOR_HEX[g.color] ?? "#4f46e5";
  const story =
    seg.start === null
      ? null
      : seg.end > seg.start
        ? `Rose from ${Math.round(seg.start)}% to ${Math.round(seg.end)}% in this period`
        : seg.end < seg.start
          ? `Fell from ${Math.round(seg.start)}% to ${Math.round(seg.end)}%`
          : `Flat at ${Math.round(seg.end)}% in this period`;
  return (
    <>
      <Section
        title="Overall progress"
        description={`${story ?? "No finished days yet"}${seg.plateaus.length ? ` · ${seg.plateaus.length} flat ${seg.plateaus.length === 1 ? "stretch" : "stretches"} (3+ days without progress, shaded)` : ""}. The dashed line is full pace: ${g.basis === "roadmap" ? "the share of roadmap tasks planned by each day" : "every task done every day"}.`}
      >
        <ProgressChart series={g.series} color={g.color} plateaus={seg.plateaus} />
      </Section>
      <Section title={`Progress gained per ${unit}`} description={`Points added in each ${unit} — separate from the running total above.${data.range.to >= data.range.today ? ` The latest ${unit} is still in progress.` : ""}`}>
        <AmountTrendChart buckets={unit === "month" ? g.trends.monthly : g.trends.weekly} unit={unit} valueKey="progressMade" name="Progress gained" suffix=" pts" color={color} detail={(b) => `${b.completed} of ${b.scheduled} tasks`} />
      </Section>
    </>
  );
}

function Consistency({ data, unit }) {
  const g = data.goal;
  const points = g.series.filter((d) => !d.future).map((d) => ({ dateKey: d.dateKey, scheduled: d.scheduled, completed: d.completed, rate: d.scheduled > 0 ? Math.round((d.completed / d.scheduled) * 100) : null }));
  const pattern = g.weekdayPattern;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Task completion" value={formatPercent(g.current.completionRate)} detail={`${g.current.completed} of ${g.current.scheduled} scheduled`} definition={data.definitions.taskCompletionRate} change={g.change.completionRate} />
        <MetricCard label="Activity streak" value={`${g.streaks.current} ${g.streaks.current === 1 ? "day" : "days"}`} detail={`Longest: ${g.streaks.longest} days`} definition={data.definitions.activityStreak} />
        <MetricCard
          label="Strongest day"
          value={pattern.best ? pattern.best.name : "—"}
          detail={pattern.best ? `${formatPercent(pattern.best.rate)} done · weakest ${pattern.worst.name} (${formatPercent(pattern.worst.rate)})` : `Not enough data yet (needs ${pattern.minObservations}+ tasks on several weekdays)`}
          definition={data.definitions.weekdayPattern}
        />
      </div>
      <Section title="Tasks completed per day" description="Share of the day's scheduled tasks completed; gaps are days with nothing scheduled.">
        <DailyCompletionChart points={points} />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={`Completion per ${unit}`} description={`Task completion rate over the last ${unit === "month" ? "6 months" : "8 weeks"}.`}>
          <TrendLineChart buckets={unit === "month" ? g.trends.monthly : g.trends.weekly} unit={unit} series={[{ key: "completionRate", name: "Tasks completed", color: COLOR_HEX[g.color] ?? "#4f46e5", countKey: "scheduled" }]} height={220} />
        </Section>
        <Section title="By weekday" description="Share of scheduled tasks completed on each weekday.">
          <WeekdayChart weekdays={g.weekdays} minObservations={data.thresholds.MIN_WEEKDAY_OBSERVATIONS} />
        </Section>
      </div>
    </>
  );
}

function Activity({ data }) {
  const g = data.goal;
  const calendar = g.series.map((d) => {
    if (d.future) return { dateKey: d.dateKey, status: "future" };
    if (d.dateKey < g.startDate) return { dateKey: d.dateKey, status: "beforeStart" };
    if (d.pending > 0) return { dateKey: d.dateKey, status: "pending", title: `${d.completed} done, ${d.pending} still open today` };
    if (d.scheduled === 0) return { dateKey: d.dateKey, status: d.progress > 0 ? "activity" : "none" };
    return { dateKey: d.dateKey, status: d.completed === d.scheduled ? "complete" : d.completed > 0 ? "partial" : "missed", title: `${d.completed} of ${d.scheduled} scheduled tasks done` };
  });
  const dates = [["Started", g.startDate], ["Deadline", g.deadline], ["Completed", g.completedOn]].filter(([, v]) => v);
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Recent activity">
          {g.recentActivity.length ? (
            <ul className="flex flex-col divide-y divide-slate-100">
              {g.recentActivity.map((a, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-14 shrink-0 text-xs text-slate-500">{shortDay(a.dateKey)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{a.title ?? "A task"}</span>
                  <span className="text-xs text-slate-400">{a.type === "roadmap" ? `planned ${shortDay(a.scheduledDate)}` : "daily task"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>No completed tasks recorded yet.</EmptyNote>
          )}
        </Section>
        <Section title="Scheduled tasks by day">
          <CalendarHeatmap days={calendar} legend={["complete", "partial", "missed", "none", "pending", "future"]} />
        </Section>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Roadmap phases" description={g.milestones.length ? "Tasks done in each phase of the roadmap." : undefined}>
          {g.milestones.length ? (
            <ul className="flex flex-col gap-3">
              {g.milestones.map((m) => (
                <li key={`${m.startDay}-${m.title}`}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-800">{m.title}</span>
                    <span className="text-xs text-slate-500">days {m.startDay}–{m.endDay} · {m.completed}/{m.tasks}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${m.tasks ? (m.completed / m.tasks) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>This goal has no roadmap phases.</EmptyNote>
          )}
        </Section>
        <Section title="Key dates">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {dates.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="font-medium text-slate-800">{formatLongDate(value)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </>
  );
}

function GoalDetailPage() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const { overview, period, qs } = useOutletContext();
  const [view, setView] = useViewParam(VIEWS.map((v) => v.id));
  const report = useInsightsReport(() => insightsApi.goal(goalId, period), `${goalId}?${qs}`);
  const goals = overview.data?.goals ?? [];
  const unit = period.period === "month" ? "month" : "week";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={`/insights/goals?${qs}`} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Goals
          </Link>
          <h2 className="truncate text-xl font-semibold tracking-tight text-slate-900">{report.data?.goal.title ?? "Goal"}</h2>
          {report.data && <StatusPill health={report.data.goal.health} />}
        </div>
        {goals.length > 1 && (
          <div className="w-56">
            <Select aria-label="Choose a goal" value={goalId} onChange={(e) => navigate(`/insights/goals/${e.target.value}?${qs}${view !== "summary" ? `&view=${view}` : ""}`)} options={goals.map((g) => ({ value: g.goalId, label: g.title }))} />
          </div>
        )}
      </div>
      <SubTabs label="Goal insight sections" tabs={VIEWS} active={view} onChange={setView} />
      <ReportGate report={report} notFoundText="This goal was not found.">
        {(data) => (
          <div role="tabpanel" aria-labelledby={`subtab-${view}`} className="flex flex-col gap-5">
            {view === "summary" && <Summary data={data} />}
            {view === "progress" && <Progress data={data} unit={unit} />}
            {view === "consistency" && <Consistency data={data} unit={unit} />}
            {view === "activity" && <Activity data={data} />}
          </div>
        )}
      </ReportGate>
    </>
  );
}

export default GoalDetailPage;
