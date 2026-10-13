// /insights/challenges — the user's challenge attempts in the selected period. Challenge numbers
// (required-activity adherence) are kept apart from goal progress and habit completion.

import { Link, useOutletContext } from "react-router";
import { Trophy } from "lucide-react";
import { insightsApi } from "../api/insights.api.js";
import { useInsightsReport } from "../hooks/useInsightsReport.js";
import { ReportGate } from "../components/InsightsShell.jsx";
import { EmptyNote, MetricCard, Section } from "../components/InsightParts.jsx";
import { DailyCompletionChart } from "../components/InsightCharts.jsx";

const dayMonth = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function ChallengeBlock({ item, definitions, qs }) {
  const p = item.period;
  const points = item.daily.filter((d) => d.status !== "future").map((d) => ({ dateKey: d.dateKey, scheduled: d.requiredTotal, completed: d.requiredMet, rate: d.rate }));
  const finishedWeeks = item.weeks.filter((w) => w.finished && w.requiredAdherence !== null);
  const best = finishedWeeks.length >= 2 ? [...finishedWeeks].sort((a, b) => b.requiredAdherence - a.requiredAdherence)[0] : null;
  const worst = finishedWeeks.length >= 2 ? [...finishedWeeks].sort((a, b) => a.requiredAdherence - b.requiredAdherence)[0] : null;
  const progress = item.progress;

  return (
    <Section
      title={item.title}
      description={`${dayMonth(item.startDate)} – ${dayMonth(item.endDate)}${item.status === "left" ? " · left" : ""}${item.phase === "ended" ? " · finished" : ""}`}
      action={<Link to={`/challenges/my/${item.id}?view=progress&${qs}`} className="text-xs font-medium text-brand-700 hover:underline">Open challenge</Link>}
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            primary
            label="Required activities done"
            value={p.requiredAdherence === null ? "—" : `${p.requiredAdherence}%`}
            detail={p.requiredTotal ? `${p.requiredMet} done, ${p.requiredMissed} missed on finished days` : "No finished challenge days in this period"}
            definition={definitions.requiredAdherence}
            change={item.change ?? undefined}
          />
          <MetricCard label="Complete days" value={`${p.completeDays} of ${p.days}`} detail="Every required activity done" definition={definitions.completeDays} />
          <MetricCard
            label="Progress to the end"
            value={progress.currentDay ? `Day ${progress.currentDay}` : item.phase === "ended" ? "Finished" : "Not started"}
            detail={`of ${progress.durationDays} · ${progress.daysRemaining} left`}
          />
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold text-slate-700">Required activities done, per day</h3>
          <DailyCompletionChart points={points} />
        </div>
        <ul className="flex flex-col gap-1 text-sm text-slate-700">
          {best && worst && best.week !== worst.week && (
            <li>
              Strongest week: week {best.week} ({best.requiredAdherence}%). Weakest: week {worst.week} ({worst.requiredAdherence}%).
            </li>
          )}
          {item.pattern.strongest && (
            <li>
              Best weekday: {item.pattern.strongest.name} ({item.pattern.strongest.rate}%); hardest: {item.pattern.weakest.name} ({item.pattern.weakest.rate}%), from at least {item.pattern.minDays} finished days each.
            </li>
          )}
          {item.change === null && <li className="text-xs text-slate-500">Comparison with the previous period appears once both have enough scheduled activities.</li>}
        </ul>
      </div>
    </Section>
  );
}

function ChallengesInsightsPage() {
  const { period, qs } = useOutletContext();
  const report = useInsightsReport(() => insightsApi.challenges(period), `challenges?${qs}`);
  return (
    <ReportGate report={report}>
      {(data) =>
        data.enrollments.length === 0 ? (
          <Section title="Challenges">
            <EmptyNote>
              <span className="flex flex-col items-center gap-2">
                <Trophy className="h-5 w-5 text-slate-400" aria-hidden="true" />
                No challenge ran during this period. <Link to="/challenges" className="font-medium text-brand-700 hover:underline">Browse challenges</Link>
              </span>
            </EmptyNote>
          </Section>
        ) : (
          data.enrollments.map((item) => <ChallengeBlock key={item.id} item={item} definitions={data.definitions} qs={qs} />)
        )
      }
    </ReportGate>
  );
}

export default ChallengesInsightsPage;
