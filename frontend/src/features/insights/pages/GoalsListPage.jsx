// /insights/goals — "Which goals am I progressing on, and which need attention?"

import { Link, useOutletContext } from "react-router";
import { ChevronRight } from "lucide-react";
import { COLOR_HEX } from "../../goals/goals.constants.js";
import { formatPercent } from "../insights.format.js";
import { ReportGate } from "../components/InsightsShell.jsx";
import { EmptyNote, MiniTrend, Section, StatusPill } from "../components/InsightParts.jsx";
import { GoalsProgressChart } from "../components/InsightCharts.jsx";

// Flagged goals first, then the rest by progress.
const ORDER = { needsAttention: 0, slowing: 1, behind: 2, onTrack: 3, notEnoughData: 4, ended: 5, notStarted: 6, completed: 7 };

function GoalRow({ goal, qs }) {
  const color = COLOR_HEX[goal.color] ?? "#4f46e5";
  const gained = goal.progressMade;
  const previous = goal.previousProgressMade;
  return (
    <li>
      <Link to={`/insights/goals/${goal.goalId}?${qs}`} className="group flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-700">{goal.title}</span>
            <StatusPill health={goal.health} />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 w-full max-w-56 rounded-full bg-slate-100" role="progressbar" aria-label={`${goal.title} progress`} aria-valuenow={Math.round(goal.overallProgress)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, goal.overallProgress)}%`, backgroundColor: color }} />
            </div>
            <span className="text-xs font-medium text-slate-700">{formatPercent(goal.overallProgress)}</span>
          </div>
          <p className="mt-1.5 truncate text-xs text-slate-500">{goal.health?.reason}</p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-slate-900">{gained > 0 ? `+${gained}` : gained} pts</p>
          <p className="text-[11px] text-slate-500">this period{previous !== undefined ? ` · ${previous} before` : ""}</p>
          {goal.scheduled > 0 && <p className="text-[11px] text-slate-500">{goal.completed}/{goal.scheduled} tasks done</p>}
        </div>
        <MiniTrend values={goal.progressSeries.map((p) => p.cumulative)} color={color} label={`${goal.title}: progress through the period`} />
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" aria-hidden="true" />
      </Link>
    </li>
  );
}

function GoalsListPage() {
  const { overview, qs } = useOutletContext();
  return (
    <ReportGate report={overview}>
      {(data) => {
        const goals = [...data.goals].sort((a, b) => (ORDER[a.health?.status] ?? 9) - (ORDER[b.health?.status] ?? 9) || b.overallProgress - a.overallProgress);
        const charted = [...data.goals].filter((g) => g.status === "active").sort((a, b) => b.progressMade - a.progressMade).slice(0, 5);
        return (
          <>
            <Section title="Your goals" description="Status uses explicit rules: progress against full pace, and recent momentum." flush>
              {goals.length ? <ul className="divide-y divide-slate-100">{goals.map((g) => <GoalRow key={g.goalId} goal={g} qs={qs} />)}</ul> : <div className="px-5 pb-3"><EmptyNote>No goals ran during this period.</EmptyNote></div>}
            </Section>
            {charted.length > 1 && (
              <Section title="Progress through the period" description="Overall progress of your most active goals, day by day.">
                <GoalsProgressChart goals={charted} />
              </Section>
            )}
          </>
        );
      }}
    </ReportGate>
  );
}

export default GoalsListPage;
