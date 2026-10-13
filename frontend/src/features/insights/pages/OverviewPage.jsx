// /insights — "How am I doing overall?": four headline numbers, one trend, what stands out, what
// needs attention, and this period's calendar. Everything else lives in the other sections.

import { useState } from "react";
import { Link, useOutletContext } from "react-router";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { formatPercent } from "../insights.format.js";
import { dailyCompletionSeries, eligibleDays, needingAttention } from "../insights.charts.js";
import { ReportGate } from "../components/InsightsShell.jsx";
import { CalendarHeatmap, EmptyNote, InsightList, MetricCard, Section, StatusPill, SubTabs } from "../components/InsightParts.jsx";
import { ActivityAreaChart, DailyCompletionChart, TrendLineChart } from "../components/InsightCharts.jsx";

const DAY_VIEWS = [
  { id: "calendar", label: "Calendar" },
  { id: "completion", label: "Completion" },
  { id: "activity", label: "Activity" },
];

function Headline({ data }) {
  const { goals, habits, tasks, activeDays, streak } = data.summary;
  const d = data.definitions;
  const daysSoFar = eligibleDays(data.charts.daily);
  const onTrack = data.goals.filter((g) => g.health?.status === "onTrack").length;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        primary
        label="Active days"
        value={daysSoFar ? `${activeDays.current} of ${daysSoFar}` : "—"}
        detail={`Days with recorded progress · streak ${streak.current} ${streak.current === 1 ? "day" : "days"}`}
        definition={`Days in this period (so far, from when you started tracking) with at least one completed task or habit progress. ${d.activityStreak}`}
      />
      <MetricCard
        label="Goals"
        value={goals.averageProgressActive === null ? "—" : formatPercent(goals.averageProgressActive)}
        detail={goals.active ? `average of ${goals.active} active · ${onTrack} on track` : "no active goals"}
        definition={d.overallGoalProgress}
      />
      <MetricCard
        label="Habits"
        value={formatPercent(habits.completionRate)}
        detail={habits.occurrences ? `${habits.completed} of ${habits.occurrences} scheduled days done` : "no finished scheduled days yet"}
        definition={d.habitCompletionRate}
        change={habits.change}
      />
      <MetricCard
        label="Tasks"
        value={formatPercent(tasks.completionRate)}
        detail={tasks.scheduled ? `${tasks.completed} of ${tasks.scheduled} scheduled done` : "nothing scheduled yet"}
        definition={d.taskCompletionRate}
        change={tasks.change}
      />
    </div>
  );
}

function OverviewPage() {
  const { overview, qs } = useOutletContext();
  const [dayView, setDayView] = useState("calendar");

  return (
    <ReportGate report={overview}>
      {(data) => {
        const monthly = data.range.period === "month";
        const buckets = monthly ? data.charts.monthly : data.charts.weekly;
        const attention = needingAttention(data.goals, data.habits);
        const observations = data.narrative.observations.filter((o) => !o.id.startsWith("weekday-not-enough"));
        const points = dailyCompletionSeries(data.charts.daily);
        return (
          <>
            <Headline data={data} />

            <Section
              title={monthly ? "Completion over the last 6 months" : "Completion over the last 8 weeks"}
              description={`Share of scheduled habit days and goal tasks completed each ${monthly ? "month" : "week"} — is it rising or falling?`}
            >
              <TrendLineChart
                buckets={buckets}
                unit={monthly ? "month" : "week"}
                series={[
                  { key: "habitRate", name: "Habits", color: "#16a34a", countKey: "habitOccurrences" },
                  { key: "taskRate", name: "Tasks", color: "#4f46e5", countKey: "taskOccurrences" },
                ]}
              />
            </Section>

            <div className="grid gap-5 lg:grid-cols-2">
              <Section
                title="What stands out"
                action={<Link to={`/insights/patterns?${qs}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">All patterns <ArrowRight className="h-3 w-3" aria-hidden="true" /></Link>}
              >
                {data.narrative.hasData ? <InsightList items={observations} limit={2} icon={Sparkles} tone="text-brand-500" /> : <EmptyNote>{data.narrative.message}</EmptyNote>}
              </Section>
              <Section title="Needs attention" description="Goals and habits flagged by their status rules.">
                {attention.length ? (
                  <ul className="flex flex-col divide-y divide-slate-100">
                    {attention.map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <Link to={`/insights/${item.kind}s/${item.id}?${qs}`} className="flex items-center gap-3 py-2.5 hover:text-brand-700">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800">{item.title}</span>
                            <span className="block truncate text-xs text-slate-500">{item.kind === "goal" ? item.health.reason : `${formatPercent(item.value)} completion`}</span>
                          </span>
                          <StatusPill health={item.health} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyNote>Nothing is flagged in this period.</EmptyNote>
                )}
              </Section>
            </div>

            <Section
              title="Day by day"
              description="Rest days, future days and days before you started are never counted as missed."
              action={<SubTabs label="Day view" tabs={DAY_VIEWS} active={dayView} onChange={setDayView} />}
            >
              {dayView === "calendar" && <CalendarHeatmap days={data.charts.daily} legend={["complete", "partial", "missed", "activity", "none", "pending", "future", "beforeStart"]} />}
              {dayView === "completion" && <DailyCompletionChart points={points} />}
              {dayView === "activity" && <ActivityAreaChart points={points} />}
            </Section>

            <div className="flex flex-wrap gap-3 text-sm">
              <Link to={`/insights/goals?${qs}`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">Explore goals <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
              <Link to={`/insights/habits?${qs}`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">Explore habits <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
          </>
        );
      }}
    </ReportGate>
  );
}

export default OverviewPage;
