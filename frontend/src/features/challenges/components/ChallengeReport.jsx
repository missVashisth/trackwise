// The participant's report: how much of the required work got done, by day, by activity and by
// week. Only finished days count; today is "in progress" until it ends.

import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
import { CalendarHeatmap, MetricCard, Section } from "../../insights/components/InsightParts.jsx";
import { DAY_TO_CALENDAR, formatAmount, plural } from "../challenges.format.js";

const dayMonth = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function Bar({ value, label }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuenow={value ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

function ChallengeReport({ enrollment }) {
  const { report } = enrollment;
  const t = report.totals;
  const calendar = report.days.map((d) => ({
    dateKey: d.dateKey,
    status: DAY_TO_CALENDAR[d.status] ?? "none",
    title:
      d.status === "rest"
        ? `Day ${d.day}: rest day`
        : d.status === "future"
          ? `Day ${d.day}: upcoming`
          : `Day ${d.day}: ${d.requiredMet} of ${d.requiredTotal} required done${d.status === "today" ? " (today, in progress)" : ""}`,
  }));

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-5">
      {report.outcome && (
        <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {report.outcome.text}
        </div>
      )}
      {report.strict?.brokenOn && report.phase !== "ended" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Missed a required activity on Day {report.strict.brokenOn.day} ({dayMonth(report.strict.brokenOn.dateKey)}). Under this challenge’s strict rule, this run no longer counts as a full completion. You can keep going, or restart from Settings.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          primary
          label="Required activities done"
          value={t.requiredAdherence === null ? "—" : `${t.requiredAdherence}%`}
          detail={t.requiredEligible ? `${t.requiredCompleted} of ${t.requiredEligible} on finished days · ${t.requiredMissed} missed` : "No finished days yet"}
          definition="Required activities done ÷ required activities scheduled on finished days. Today counts once it has ended; rest days are left out."
        />
        <MetricCard label="Complete days" value={t.completeDays} detail={`Every required activity done · ${plural(t.missedRequiredDays, "day")} with a miss`} />
        <MetricCard label="Current streak" value={plural(report.streak.current, "day")} detail={`Longest: ${plural(report.streak.longest, "day")}`} definition="Complete days in a row. Rest days don't break a streak; today counts once it's complete." />
        <MetricCard
          label={report.phase === "ended" ? "Finished" : "Days remaining"}
          value={report.phase === "ended" ? "✓" : report.daysRemaining}
          detail={report.phase === "running" ? `Day ${report.currentDay} of ${enrollment.durationDays}` : report.phase === "upcoming" ? `Starts ${dayMonth(enrollment.startDate)}` : `${dayMonth(enrollment.startDate)} – ${dayMonth(enrollment.endDate)}`}
        />
      </div>

      {report.trend && (
        <p className="flex items-center gap-2 text-sm text-slate-700">
          {report.trend.direction === "down" ? <TrendingDown className="h-4 w-4 text-red-500" aria-hidden="true" /> : <TrendingUp className="h-4 w-4 text-green-600" aria-hidden="true" />}
          Last 7 days: {report.trend.recent}% of activities done, compared with {report.trend.previous}% the week before
          {report.trend.direction === "steady" ? " — about the same." : report.trend.direction === "up" ? " — improving." : " — a dip worth a look."}
        </p>
      )}

      <Section title="Day by day" description="Each square is one day of the challenge.">
        <CalendarHeatmap days={calendar} legend={["complete", "partial", "missed", "none", "pending", "future"]} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="By activity" description="On finished days when it was scheduled.">
          <ul className="flex flex-col gap-3">
            {report.byActivity.map((a) => (
              <li key={a.key}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">
                    {a.title}
                    {!a.required && <span className="ml-1.5 text-xs font-normal text-slate-400">optional</span>}
                  </span>
                  <span className="text-xs text-slate-500">{a.eligible ? `${a.completed} of ${a.eligible} · ${a.adherence}%` : "not due yet"}</span>
                </div>
                <div className="mt-1.5"><Bar value={a.adherence} label={`${a.title} done`} /></div>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="By week" description="Challenge weeks: days 1–7, 8–14, …">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-1 font-medium">Week</th>
                <th className="pb-1 font-medium">Dates</th>
                <th className="pb-1 font-medium">Complete days</th>
                <th className="pb-1 text-right font-medium">Required done</th>
              </tr>
            </thead>
            <tbody>
              {report.weeks.map((w) => (
                <tr key={w.week} className="border-t border-slate-100">
                  <td className="py-1.5">{w.week}{!w.finished && <span className="ml-1 text-xs text-slate-400">(in progress)</span>}</td>
                  <td className="py-1.5 text-slate-500">{dayMonth(w.from)} – {dayMonth(w.to)}</td>
                  <td className="py-1.5">{w.completeDays}</td>
                  <td className="py-1.5 text-right">{w.requiredAdherence === null ? "—" : `${w.requiredAdherence}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Recent activity">
        {enrollment.recentActivity.length ? (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {enrollment.recentActivity.map((a) => (
              <li key={`${a.dateKey}-${a.activityKey}`} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-slate-800">{a.title}{a.value !== null && a.value !== undefined ? ` · ${formatAmount(a.value)} ${a.unit}` : ""}</span>
                <span className="text-xs text-slate-500">{dayMonth(a.dateKey)} · {a.progressPercent >= 100 ? "done" : `${a.progressPercent}%`}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nothing logged yet.</p>
        )}
      </Section>
    </div>
  );
}

export default ChallengeReport;
