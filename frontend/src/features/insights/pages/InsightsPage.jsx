// /insights — performance across all goals, tasks and habits for a week, month or custom range.

import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "../../../lib/cn.js";
import { insightsApi } from "../api/insights.api.js";
import { useInsightsReport } from "../hooks/useInsightsReport.js";
import { formatPercent, periodQueryString } from "../insights.format.js";
import InsightsLayout from "../components/InsightsLayout.jsx";
import { usePeriodParam } from "../hooks/usePeriodParam.js";
import { CalendarHeatmap, EmptyNote, MetricCard, NarrativePanel, Section } from "../components/InsightParts.jsx";
import { DailyActivityChart, GoalProgressChart, HabitConsistencyChart, RateComparisonChart, WeekdayChart } from "../components/InsightCharts.jsx";
import HabitIcon from "../../habits/components/HabitIcon.jsx";

const STATUS_LABEL = { active: "Active", upcoming: "Upcoming", ended: "Past deadline", completed: "Completed" };

function Summary({ data }) {
  const { goals, habits, tasks, streak, activeDays } = data.summary;
  const d = data.definitions;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Goals"
        value={`${goals.active} active`}
        detail={`${goals.upcoming} upcoming · ${goals.ended} past deadline · ${goals.completed} completed${goals.completedInRange ? ` (${goals.completedInRange} in this period)` : ""}`}
        definition="Statuses as shown in the app. Goals have no paused state."
      />
      <MetricCard
        label="Average goal progress"
        value={formatPercent(goals.averageProgressActive)}
        detail={goals.active ? `across ${goals.active} active ${goals.active === 1 ? "goal" : "goals"}` : "no active goals"}
        definition={d.overallGoalProgress}
      />
      <MetricCard
        label="Habit completion"
        value={formatPercent(habits.completionRate)}
        detail={
          habits.occurrences
            ? `${habits.completed} of ${habits.occurrences} scheduled days${habits.partial ? ` · ${habits.partial} partly` : ""}${habits.flexibleTargetRate !== null ? ` · weekly/monthly targets ${formatPercent(habits.flexibleTargetRate)}` : ""}`
            : `${habits.tracked} ${habits.tracked === 1 ? "habit" : "habits"} tracked — no finished scheduled days yet`
        }
        definition={`${d.habitCompletionRate} ${d.flexibleTargetRate}`}
        change={habits.change}
      />
      <MetricCard
        label="Task completion"
        value={formatPercent(tasks.completionRate)}
        detail={`${tasks.completed} done · ${tasks.remaining} not done · ${tasks.pendingToday} open today`}
        definition={d.taskCompletionRate}
        change={tasks.change}
      />
      <MetricCard label="Habits tracked" value={habits.tracked} detail={habits.averageProgress !== null ? `average ${formatPercent(habits.averageProgress)} on scheduled days (partial credit)` : undefined} definition={d.habitAverageProgress} />
      <MetricCard label="Tasks scheduled" value={tasks.scheduled} detail={`${tasks.breakdown.goalTasks.scheduled} goal tasks · ${tasks.breakdown.todos.scheduled} to-dos`} definition={d.taskCompletionRate} />
      <MetricCard label="Activity streak" value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`} detail={`Longest: ${streak.longest} days (last ${streak.lookbackDays} days)`} definition={d.activityStreak} />
      <MetricCard label="Active days" value={activeDays.current} detail={`${activeDays.previous} in the previous period`} definition="Days in the period with at least one recorded completion or habit progress." />
    </div>
  );
}

function ItemList({ items, empty, render }) {
  if (!items.length) return <EmptyNote>{empty}</EmptyNote>;
  return <ul className="flex flex-col divide-y divide-slate-100">{items.map(render)}</ul>;
}

function InsightsPage() {
  const [period, setPeriod, query] = usePeriodParam();
  const report = useInsightsReport(() => insightsApi.overview(period), query);
  const qs = periodQueryString(period);

  return (
    <InsightsLayout title="Insights" subtitle="Your goals, tasks and habits over time" period={period} setPeriod={setPeriod} report={report}>
      {(data) => (
        <div className="flex flex-col gap-4">
          <Summary data={data} />
          <NarrativePanel narrative={data.narrative} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Daily activity" description="What was scheduled each day, and how much got done.">
              <DailyActivityChart daily={data.charts.daily} />
            </Section>
            <Section title="Activity calendar" description="Missed means something was scheduled and nothing was done. Rest days, future days and days before you started are never missed.">
              <CalendarHeatmap days={data.charts.daily} />
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Goal progress" description="Overall progress of your most active goals through the period.">
              <GoalProgressChart goals={data.charts.goalProgress} />
            </Section>
            <Section title="Habit consistency" description="Each habit's completion in this period (targets for weekly/monthly habits).">
              <HabitConsistencyChart habits={data.charts.habitConsistency} />
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Last 8 weeks" description="Completion rates per week (Monday–Sunday).">
              <RateComparisonChart buckets={data.charts.weekly} unit="week" />
            </Section>
            <Section title="Last 6 months" description="Completion rates per calendar month.">
              <RateComparisonChart buckets={data.charts.monthly} unit="month" />
            </Section>
            <Section title="By weekday" description="Completion rate of everything scheduled on each weekday in this period.">
              <WeekdayChart weekdays={data.charts.weekdays} minObservations={data.thresholds.MIN_WEEKDAY_OBSERVATIONS} />
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Goals" description="Open a goal for its own insights.">
              <ItemList
                items={data.goals}
                empty="No goals ran during this period."
                render={(g) => (
                  <li key={g.goalId}>
                    <Link to={`/insights/goals/${g.goalId}?${qs}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{g.title}</span>
                        <span className="block text-xs text-slate-500">
                          {STATUS_LABEL[g.status]} · {Math.round(g.overallProgress)}% overall · +{g.progressMade} pts this period{g.scheduled ? ` · ${g.completed}/${g.scheduled} tasks` : ""}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                    </Link>
                  </li>
                )}
              />
            </Section>
            <Section title="Habits" description="Open a habit for its own insights.">
              <ItemList
                items={data.habits}
                empty="No habits were active during this period."
                render={(h) => (
                  <li key={h.habitId}>
                    <Link to={`/insights/habits/${h.habitId}?${qs}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                      <HabitIcon icon={h.icon} color={h.color} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{h.title}{h.archived && <span className="ml-1 text-xs font-normal text-slate-400">archived</span>}</span>
                        <span className="block text-xs text-slate-500">
                          {h.rate === null ? "No finished days yet" : `${formatPercent(h.rate)} ${h.kind === "fixed" ? `of ${h.observations} scheduled days` : "of target"}`} · streak {h.streak.current} {h.streak.unit === "occurrences" ? "days" : h.streak.unit}
                        </span>
                      </span>
                      <span className={cn("text-sm font-semibold", h.rate === null ? "text-slate-300" : "text-slate-800")}>{formatPercent(h.rate)}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                    </Link>
                  </li>
                )}
              />
            </Section>
          </div>

          <p className="text-xs text-slate-500">{data.definitions.periods}</p>
        </div>
      )}
    </InsightsLayout>
  );
}

export default InsightsPage;
