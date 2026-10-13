// Challenge progress, computed from the participant's logs (the only source of truth).
//
// Per activity and day:  future (not reached yet) | rest (not scheduled that weekday, or switched
// off) | done (target reached) | open (today, not done yet — never "missed" before the day ends) |
// missed (a finished day without reaching the target).
// Per day: future | rest | today | complete (every required activity done) | partial | missed.
// Only finished days (before today, up to the last day) count towards adherence.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const keyToUtc = (key) => Date.parse(`${key}T00:00:00Z`);
const shiftKey = (key, days) => new Date(keyToUtc(key) + days * MS_PER_DAY).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((keyToUtc(to) - keyToUtc(from)) / MS_PER_DAY);
const weekdayOf = (key) => new Date(keyToUtc(key)).getUTCDay();
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

const TREND_WINDOW = 7;
const MIN_TREND_OCCURRENCES = 5;

/** Is this activity expected on dateKey? (Switched-off optional activities never are.) */
function isScheduled(activity, dateKey) {
  if (activity.enabled === false) return false;
  return !activity.days?.length || activity.days.includes(weekdayOf(dateKey));
}

/** 0–100 progress a logged value represents for an activity (target in force when logged). */
function progressFor(activity, { done, value, target }) {
  if (activity.kind === "checkbox") return done ? 100 : 0;
  const goal = target ?? activity.target;
  if (!(goal > 0) || !(value >= 0)) return 0;
  return Math.min(100, Math.round((value / goal) * 1000) / 10);
}

function activityStatus(activity, dateKey, log, today) {
  if (dateKey > today) return "future";
  if (!isScheduled(activity, dateKey)) return "rest";
  if (log && log.progressPercent >= 100) return "done";
  return dateKey === today ? "open" : "missed";
}

/** Where the enrollment stands on `today`: upcoming | running | ended | left. */
function phaseOf(enrollment, today) {
  if (enrollment.status === "left") return "left";
  if (today < enrollment.startDate) return "upcoming";
  if (today > enrollment.endDate) return "ended";
  return "running";
}

/**
 * Full report for one enrollment.
 * @param enrollment - { startDate, endDate, durationDays, strict, status, activities }
 * @param logs - [{ activityKey, dateKey, progressPercent, value, done, target }]
 * @param today - the participant's local date
 */
function buildReport(enrollment, logs, today) {
  const { startDate, endDate } = enrollment;
  const activities = enrollment.activities ?? [];
  const logByKey = new Map(logs.map((l) => [`${l.activityKey}|${l.dateKey}`, l]));
  const lastShown = endDate; // the whole run, future days included
  const lastFinished = today > endDate ? endDate : shiftKey(today, -1);

  const days = [];
  const perActivity = new Map(activities.map((a) => [a.key, { key: a.key, title: a.title, required: a.required, eligible: 0, completed: 0, missed: 0 }]));
  const totals = { eligible: 0, completed: 0, missed: 0, requiredEligible: 0, requiredCompleted: 0, requiredMissed: 0 };

  for (let d = startDate, n = 1; d <= lastShown; d = shiftKey(d, 1), n += 1) {
    const items = activities.map((activity) => {
      const log = logByKey.get(`${activity.key}|${d}`) ?? null;
      return { key: activity.key, required: activity.required, status: activityStatus(activity, d, log, today), progressPercent: log?.progressPercent ?? 0 };
    });
    const scheduled = items.filter((i) => i.status !== "rest" && i.status !== "future");
    const required = scheduled.filter((i) => i.required);
    const requiredMet = required.filter((i) => i.status === "done").length;
    const met = scheduled.filter((i) => i.status === "done").length;

    let status;
    if (d > today) status = "future";
    else if (scheduled.length === 0) status = "rest";
    else if (d === today) status = "today";
    else if (requiredMet === required.length && (required.length > 0 || met === scheduled.length)) status = "complete";
    else if (met > 0) status = "partial";
    else status = "missed";

    if (d <= lastFinished) {
      for (const item of scheduled) {
        const stats = perActivity.get(item.key);
        stats.eligible += 1;
        totals.eligible += 1;
        if (item.status === "done") {
          stats.completed += 1;
          totals.completed += 1;
        } else {
          stats.missed += 1;
          totals.missed += 1;
        }
        if (item.required) {
          totals.requiredEligible += 1;
          if (item.status === "done") totals.requiredCompleted += 1;
          else totals.requiredMissed += 1;
        }
      }
    }
    days.push({ dateKey: d, day: n, status, requiredMet, requiredTotal: required.length, met, total: scheduled.length, activities: items });
  }

  // Streaks: consecutive complete days; rest days neither break nor extend a streak. Today only
  // extends the streak once it is complete (an unfinished today never breaks it).
  const finished = days.filter((day) => day.dateKey <= lastFinished);
  let current = 0;
  const todayEntry = days.find((day) => day.dateKey === today);
  const todayComplete = todayEntry && todayEntry.requiredTotal > 0 && todayEntry.requiredMet === todayEntry.requiredTotal;
  for (let i = finished.length - 1; i >= 0; i -= 1) {
    if (finished[i].status === "rest") continue;
    if (finished[i].status !== "complete") break;
    current += 1;
  }
  if (todayComplete) current += 1;
  let longest = 0;
  let run = 0;
  for (const day of [...finished, ...(todayComplete ? [todayEntry] : [])]) {
    if (day.status === "rest") continue;
    run = day.status === "complete" || day === todayEntry ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  // Challenge weeks (days 1–7, 8–14, …) that have started.
  const weeks = [];
  for (let w = 0; w * 7 < days.length; w += 1) {
    const slice = days.slice(w * 7, w * 7 + 7);
    if (slice[0].dateKey > today) break;
    const counted = slice.filter((day) => day.dateKey <= lastFinished);
    const req = counted.reduce((s, day) => s + day.requiredTotal, 0);
    const reqMet = counted.reduce((s, day) => s + day.requiredMet, 0);
    const all = counted.reduce((s, day) => s + day.total, 0);
    const allMet = counted.reduce((s, day) => s + day.met, 0);
    weeks.push({
      week: w + 1,
      from: slice[0].dateKey,
      to: slice[slice.length - 1].dateKey,
      finished: slice[slice.length - 1].dateKey <= lastFinished,
      completeDays: counted.filter((day) => day.status === "complete").length,
      requiredAdherence: pct(reqMet, req),
      adherence: pct(allMet, all),
    });
  }

  // Recent change: last 7 finished days vs the 7 before, when both have enough scheduled activities.
  const windowStats = (to) => {
    const from = shiftKey(to, -(TREND_WINDOW - 1));
    const span = finished.filter((day) => day.dateKey >= from && day.dateKey <= to);
    const total = span.reduce((s, day) => s + day.total, 0);
    return { total, rate: pct(span.reduce((s, day) => s + day.met, 0), total) };
  };
  let trend = null;
  if (finished.length) {
    const recent = windowStats(lastFinished);
    const before = windowStats(shiftKey(lastFinished, -TREND_WINDOW));
    if (recent.total >= MIN_TREND_OCCURRENCES && before.total >= MIN_TREND_OCCURRENCES) {
      const change = Math.round((recent.rate - before.rate) * 10) / 10;
      trend = { recent: recent.rate, previous: before.rate, change, direction: change >= 5 ? "up" : change <= -5 ? "down" : "steady" };
    }
  }

  // Strict challenges: the first finished day with a missed required activity.
  const firstMiss = enrollment.strict ? finished.find((day) => day.requiredTotal > day.requiredMet && day.status !== "rest") : null;

  const phase = phaseOf(enrollment, today);
  const currentDay = phase === "running" ? daysBetween(startDate, today) + 1 : null;
  const daysRemaining = phase === "upcoming" ? enrollment.durationDays : phase === "running" ? daysBetween(today, endDate) + 1 : 0;
  const missedRequiredDays = finished.filter((day) => day.requiredTotal > day.requiredMet && day.status !== "rest").length;

  let outcome = null;
  if (phase === "ended") {
    if (enrollment.strict) {
      outcome = firstMiss
        ? { kind: "finished_with_misses", text: `Finished all ${enrollment.durationDays} days. Required activities were missed on ${missedRequiredDays} ${missedRequiredDays === 1 ? "day" : "days"}, so this run doesn't count as a full completion under the strict rule.` }
        : { kind: "completed", text: `Completed: every required activity, every day of the ${enrollment.durationDays} days.` };
    } else {
      outcome = { kind: "finished", text: `Finished all ${enrollment.durationDays} days with ${pct(totals.requiredCompleted, totals.requiredEligible) ?? 0}% of required activities done.` };
    }
  }

  return {
    phase,
    today,
    currentDay,
    daysRemaining,
    totals: {
      ...totals,
      adherence: pct(totals.completed, totals.eligible),
      requiredAdherence: pct(totals.requiredCompleted, totals.requiredEligible),
      completeDays: finished.filter((day) => day.status === "complete").length,
      missedRequiredDays,
    },
    todaySummary: todayEntry ? { requiredMet: todayEntry.requiredMet, requiredTotal: todayEntry.requiredTotal, met: todayEntry.met, total: todayEntry.total } : null,
    byActivity: [...perActivity.values()].map((a) => ({ ...a, adherence: pct(a.completed, a.eligible) })),
    weeks,
    trend,
    streak: { current, longest },
    strict: enrollment.strict
      ? { brokenOn: firstMiss ? { day: firstMiss.day, dateKey: firstMiss.dateKey } : null, qualifies: !firstMiss }
      : null,
    outcome,
    days,
  };
}

module.exports = { buildReport, progressFor, isScheduled, activityStatus, phaseOf, shiftKey, daysBetween };
