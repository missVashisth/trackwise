// /insights/habits — "Which habits am I building successfully, and where am I struggling?"

import { Link, useOutletContext } from "react-router";
import { ChevronRight } from "lucide-react";
import { COLOR_HEX } from "../../goals/goals.constants.js";
import HabitIcon from "../../habits/components/HabitIcon.jsx";
import { formatPercent } from "../insights.format.js";
import { ReportGate } from "../components/InsightsShell.jsx";
import { Delta, EmptyNote, MiniTrend, Section, StatusPill } from "../components/InsightParts.jsx";
import { HabitComparisonChart } from "../components/InsightCharts.jsx";

const ORDER = { declining: 0, struggling: 1, building: 2, strong: 3, notEnoughData: 4, archived: 5 };

function basisText(h) {
  if (h.rate === null) return h.kind === "fixed" ? "No finished scheduled days yet" : "No finished week or month yet";
  if (h.kind === "fixed") return `${h.completed} of ${h.total} scheduled days`;
  // Partial sessions count toward the target, so the rate can be high with no period fully met.
  return `${formatPercent(h.rate)} of target over ${h.total} finished ${h.total === 1 ? "period" : "periods"} · ${h.completed} fully met`;
}

function HabitRow({ habit, qs }) {
  const color = COLOR_HEX[habit.color] ?? "#16a34a";
  const streakUnit = habit.streak.unit === "occurrences" ? "days" : habit.streak.unit;
  return (
    <li>
      <Link to={`/insights/habits/${habit.habitId}?${qs}`} className="group flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50">
        <HabitIcon icon={habit.icon} color={habit.color} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-700">{habit.title}</span>
            <StatusPill health={habit.health} />
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {basisText(habit)}
            {habit.streak.current > 0 && ` · ${habit.streak.current}-${streakUnit.replace(/s$/, "")} streak`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tracking-tight text-slate-900">{formatPercent(habit.rate)}</p>
          <Delta change={habit.change} className="hidden sm:inline-flex" />
        </div>
        <MiniTrend values={habit.weeklyRates.map((w) => w.rate)} color={color} label={`${habit.title}: completion per week, last 8 weeks`} />
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" aria-hidden="true" />
      </Link>
    </li>
  );
}

function HabitsListPage() {
  const { overview, qs } = useOutletContext();
  return (
    <ReportGate report={overview}>
      {(data) => {
        const habits = [...data.habits].sort((a, b) => (ORDER[a.health?.status] ?? 9) - (ORDER[b.health?.status] ?? 9) || (a.rate ?? 101) - (b.rate ?? 101));
        return (
          <>
            <Section title="Your habits" description="Completion in this period; the small line shows the last 8 weeks." flush>
              {habits.length ? <ul className="divide-y divide-slate-100">{habits.map((h) => <HabitRow key={h.habitId} habit={h} qs={qs} />)}</ul> : <div className="px-5 pb-3"><EmptyNote>No habits were active during this period.</EmptyNote></div>}
            </Section>
            {data.charts.habitConsistency.filter((h) => h.rate !== null).length > 1 && (
              <Section title="Compared" description="Each habit's completion in this period (target reached, for weekly or monthly habits).">
                <HabitComparisonChart habits={data.charts.habitConsistency} />
              </Section>
            )}
          </>
        );
      }}
    </ReportGate>
  );
}

export default HabitsListPage;
