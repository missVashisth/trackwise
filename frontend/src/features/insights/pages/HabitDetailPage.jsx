// /insights/habits/:habitId — one habit, with focused sub-tabs (?view=summary|consistency|progress|activity).

import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Select } from "../../../components/ui/index.js";
import { COLOR_HEX } from "../../goals/goals.constants.js";
import { habitsApi } from "../../habits/api/habits.api.js";
import { formatNumber, scheduleLabel } from "../../habits/habits.logic.js";
import { insightsApi } from "../api/insights.api.js";
import { useInsightsReport } from "../hooks/useInsightsReport.js";
import { useViewParam } from "../hooks/usePeriodParam.js";
import { OUTCOME_TO_STATUS, formatPercent, shortDay } from "../insights.format.js";
import { cumulativeOccurrences, habitValueSeries, lastInterruption } from "../insights.charts.js";
import { ReportGate } from "../components/InsightsShell.jsx";
import { CalendarHeatmap, EmptyNote, InsightList, MetricCard, Section, StatusPill, SubTabs } from "../components/InsightParts.jsx";
import { HabitValueChart, OccurrencesChart, PeriodTargetChart, TrendLineChart, WeekdayChart } from "../components/InsightCharts.jsx";

const VIEWS = [
  { id: "summary", label: "Summary" },
  { id: "consistency", label: "Consistency" },
  { id: "progress", label: "Progress" },
  { id: "activity", label: "Activity" },
];
const REPEATS_CARDS = new Set(["rate", "strong", "weak", "streak"]);

function Summary({ data }) {
  const h = data.habit;
  const c = h.current;
  const fixed = c.kind === "fixed";
  const n = data.narrative;
  const streakUnit = h.streaks.unit === "occurrences" ? "days" : h.streaks.unit;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          primary
          label={fixed ? "Completion" : "Target reached"}
          value={formatPercent(c.rate)}
          detail={fixed ? (c.opportunities ? `${c.completed} of ${c.opportunities} scheduled days${c.partial ? ` · ${c.partial} partly` : ""}` : "no finished scheduled days yet") : c.periodsEnded ? `${c.periodsMet} of ${c.periodsEnded} ${c.periodType}s on target` : "no finished period yet"}
          definition={fixed ? data.definitions.habitCompletionRate : data.definitions.flexibleTargetRate}
          change={h.change}
        />
        <MetricCard label="Current streak" value={`${h.streaks.current} ${streakUnit}`} detail={`Longest: ${h.streaks.longest} ${streakUnit}`} definition={data.definitions.habitStreak} />
        {h.numeric ? (
          <MetricCard label={`Total ${h.numeric.unit}`} value={formatNumber(h.numeric.total)} detail={h.numeric.averagePerLoggedDay !== null ? `${formatNumber(h.numeric.averagePerLoggedDay)} per logged day · target ${formatNumber(h.numeric.target)}` : "nothing logged yet"} />
        ) : fixed ? (
          <MetricCard label="Average progress" value={formatPercent(c.averageProgress)} detail="on scheduled days, partial days count partly" definition={data.definitions.habitAverageProgress} />
        ) : (
          <MetricCard label={`This ${c.periodType}`} value={h.currentPeriod ? `${h.currentPeriod.credit} / ${h.currentPeriod.target}` : "—"} detail="sessions so far (partial days count partly)" />
        )}
      </div>
      <Section title="What stands out">
        {n.hasData ? (
          <div className="grid gap-5 md:grid-cols-2">
            <InsightList items={[...n.observations, ...n.weaknesses, ...n.strengths].filter((o) => !REPEATS_CARDS.has(o.id)).slice(0, 2)} icon={Sparkles} tone="text-brand-500" empty="Nothing unusual in this period." />
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

function Consistency({ data, unit }) {
  const h = data.habit;
  const fixed = h.current.kind === "fixed";
  const color = COLOR_HEX[h.color] ?? "#16a34a";
  return (
    <>
      <Section title={`Completion per ${unit}`} description={`${fixed ? "Share of scheduled days completed" : "Target reached"} over the last ${unit === "month" ? "6 months" : "8 weeks"}.`}>
        <TrendLineChart buckets={unit === "month" ? h.trends.monthly : h.trends.weekly} unit={unit} series={[{ key: "rate", name: fixed ? "Completed" : "Target reached", color, countKey: fixed ? "opportunities" : "periodsEnded" }]} />
      </Section>
      {fixed ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Scheduled vs completed" description="Running totals this period — the gap is what was missed.">
            <OccurrencesChart points={cumulativeOccurrences(h.daily)} color={h.color} />
          </Section>
          <Section title="By weekday" description="Share of scheduled days completed on each weekday.">
            <WeekdayChart weekdays={h.current.weekdays} minObservations={data.thresholds.MIN_WEEKDAY_OBSERVATIONS} />
          </Section>
        </div>
      ) : (
        <Section title="By weekday">
          <EmptyNote>Weekly and monthly habits have no fixed days, so no weekday can be missed.</EmptyNote>
        </Section>
      )}
    </>
  );
}

function Progress({ data }) {
  const h = data.habit;
  const c = h.current;
  if (c.kind === "flexible") {
    const periods = [...c.periods];
    if (h.currentPeriod && !periods.some((p) => p.from === h.currentPeriod.from)) periods.push(h.currentPeriod);
    return (
      <Section title={`Sessions per ${c.periodType}`} description="Sessions earned against the target (dashed). Partial days count partly; the current period is lighter.">
        <PeriodTargetChart periods={periods} periodType={c.periodType} color={h.color} />
      </Section>
    );
  }
  if (h.trackingMethod === "checkbox") {
    return (
      <Section title="Completed vs scheduled" description="Running totals of scheduled days and the days you completed.">
        <OccurrencesChart points={cumulativeOccurrences(h.daily)} color={h.color} />
      </Section>
    );
  }
  const measurable = h.trackingMethod === "measurable";
  return (
    <Section
      title={measurable ? `${(h.numeric?.unit ?? "amount").replace(/^./, (c) => c.toUpperCase())} per day` : "Progress per day"}
      description={`${measurable ? "Recorded amounts against the daily target (dashed)" : "Logged progress (100% = done)"}. Red circles are scheduled days that ended without progress; rest days are gaps.`}
    >
      <HabitValueChart points={habitValueSeries(h.daily, h.trackingMethod)} trackingMethod={h.trackingMethod} target={h.numeric?.target} unit={h.numeric?.unit} color={h.color} />
    </Section>
  );
}

function Activity({ data }) {
  const h = data.habit;
  const calendar = h.daily.map((d) => ({
    dateKey: d.dateKey,
    status: OUTCOME_TO_STATUS[d.outcome] ?? "none",
    title: d.progressPercent !== null ? `${formatNumber(d.progressPercent)}%${d.actualValue !== null ? ` (${formatNumber(d.actualValue)} ${h.numeric?.unit ?? ""})` : ""}` : d.outcome === "rest" ? "Rest day" : undefined,
  }));
  const logs = [...h.daily].reverse().filter((d) => d.progressPercent !== null).slice(0, 8);
  const interruption = lastInterruption(h.daily);
  const streakUnit = h.streaks.unit === "occurrences" ? "days" : h.streaks.unit;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Calendar" description={`Current streak ${h.streaks.current} ${streakUnit} · longest ${h.streaks.longest}${interruption ? ` · last missed ${shortDay(interruption)}` : ""}.`}>
        <CalendarHeatmap days={calendar} legend={["complete", "partial", "missed", "activity", "none", "pending", "future"]} />
      </Section>
      <Section title="Recent logs">
        {logs.length ? (
          <ul className="flex flex-col divide-y divide-slate-100">
            {logs.map((d) => (
              <li key={d.dateKey} className="flex items-start gap-3 py-2 text-sm">
                <span className="w-14 shrink-0 text-xs text-slate-500">{shortDay(d.dateKey)}</span>
                <span className="w-24 shrink-0 font-medium text-slate-800">
                  {formatNumber(d.progressPercent)}%
                  {d.actualValue !== null && <span className="block text-xs font-normal text-slate-500">{formatNumber(d.actualValue)} {h.numeric?.unit}</span>}
                </span>
                <span className="min-w-0 flex-1 text-slate-600">{d.note ?? ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>Nothing logged in this period yet.</EmptyNote>
        )}
      </Section>
    </div>
  );
}

function HabitDetailPage() {
  const { habitId } = useParams();
  const navigate = useNavigate();
  const { period, qs } = useOutletContext();
  const [view, setView] = useViewParam(VIEWS.map((v) => v.id));
  const report = useInsightsReport(() => insightsApi.habit(habitId, period), `${habitId}?${qs}`);
  const [habits, setHabits] = useState([]);
  useEffect(() => {
    habitsApi.list("all").then(({ habits: list }) => setHabits(list), () => {});
  }, []);
  const unit = period.period === "month" ? "month" : "week";
  const h = report.data?.habit;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={`/insights/habits?${qs}`} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Habits
          </Link>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight text-slate-900">{h?.title ?? "Habit"}</h2>
            {h && <p className="truncate text-xs text-slate-500">{scheduleLabel(h.schedule)}</p>}
          </div>
          {h && <StatusPill health={h.health} />}
        </div>
        {habits.length > 1 && (
          <div className="w-56">
            <Select aria-label="Choose a habit" value={habitId} onChange={(e) => navigate(`/insights/habits/${e.target.value}?${qs}${view !== "summary" ? `&view=${view}` : ""}`)} options={habits.map((x) => ({ value: x.id, label: x.title }))} />
          </div>
        )}
      </div>
      <SubTabs label="Habit insight sections" tabs={VIEWS} active={view} onChange={setView} />
      <ReportGate report={report} notFoundText="This habit was not found.">
        {(data) => (
          <div role="tabpanel" aria-labelledby={`subtab-${view}`} className="flex flex-col gap-5">
            {view === "summary" && <Summary data={data} />}
            {view === "consistency" && <Consistency data={data} unit={unit} />}
            {view === "progress" && <Progress data={data} />}
            {view === "activity" && <Activity data={data} />}
          </div>
        )}
      </ReportGate>
    </>
  );
}

export default HabitDetailPage;
