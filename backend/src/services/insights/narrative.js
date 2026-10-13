// Turns computed metrics into short, factual statements. Deterministic rules only; every item
// carries the numbers it is based on (`evidence`). No causes are guessed and nothing is predicted.
//
// Thresholds (documented in one place):
//   MIN_RATE_OBSERVATIONS  occurrences needed in BOTH periods before comparing two rates
//   MIN_CHANGE_POINTS      a rate change smaller than this is reported as "about the same"
//   STRONG_RATE / WEAK_RATE habit or task completion rates called strong / weak
//   MIN_HABIT_OBSERVATIONS occurrences (or ended periods for flexible habits) before judging a habit
//   Weekday patterns: see habitAnalytics.MIN_WEEKDAY_OBSERVATIONS (4) and a 15-point spread.

const { MIN_WEEKDAY_OBSERVATIONS } = require("./habitAnalytics");

const MIN_RATE_OBSERVATIONS = 5;
const MIN_CHANGE_POINTS = 10;
const STRONG_RATE = 80;
const WEAK_RATE = 50;
const MIN_HABIT_OBSERVATIONS = 5;
const STALL_DAYS = 14;
const LONG_STREAK = 7;
const MAX_RECOMMENDATIONS = 4;

const pct = (n) => `${Math.round(n)}%`;

function labels(range) {
  const unit = range.period === "custom" ? "period" : range.period;
  const containsToday = range.from <= range.today && range.today <= range.to;
  return containsToday ? { current: `this ${unit}`, previous: `last ${unit}` } : { current: `in the selected ${unit}`, previous: `the ${unit} before` };
}

function compareRates({ subject, current, currentObs, previous, previousObs, range }) {
  if (current === null || previous === null || currentObs < MIN_RATE_OBSERVATIONS || previousObs < MIN_RATE_OBSERVATIONS) return null;
  const { current: now, previous: before } = labels(range);
  const change = current - previous;
  const direction = Math.abs(change) < MIN_CHANGE_POINTS ? "same" : change > 0 ? "up" : "down";
  const text =
    direction === "same"
      ? `You completed ${pct(current)} of your ${subject} ${now}, about the same as ${before} (${pct(previous)}).`
      : `You completed ${pct(current)} of your ${subject} ${now}, ${direction} from ${pct(previous)} ${before}.`;
  return { direction, text, evidence: { current, previous, currentObservations: currentObs, previousObservations: previousObs } };
}

function habitName(h) {
  return `“${h.title}”`;
}

/** Statements for the overview. */
function overviewNarrative({ range, habits, goals, pooled }) {
  const observations = [];
  const strengths = [];
  const weaknesses = [];
  const recommendations = [];

  const habitChange = compareRates({ subject: "scheduled habit occurrences", current: pooled.habitRate, currentObs: pooled.habitObs, previous: pooled.habitRatePrev, previousObs: pooled.habitObsPrev, range });
  if (habitChange) {
    observations.push({ id: "habit-rate-change", text: habitChange.text, evidence: habitChange.evidence });
    if (habitChange.direction === "up") strengths.push({ id: "habit-improving", text: `Your habit completion rate improved by ${Math.round(habitChange.evidence.current - habitChange.evidence.previous)} points.`, evidence: habitChange.evidence });
    if (habitChange.direction === "down") {
      weaknesses.push({ id: "habit-declining", text: `Your habit completion rate is ${Math.round(habitChange.evidence.previous - habitChange.evidence.current)} points below ${labels(range).previous}.`, evidence: habitChange.evidence });
      recommendations.push({ id: "rec-habit-decline", text: "Your habit completion rate has fallen compared with the previous period. Consider temporarily lowering a target or the number of scheduled days for the habits you miss most." });
    }
  }

  const taskChange = compareRates({ subject: "scheduled goal tasks", current: pooled.taskRate, currentObs: pooled.taskObs, previous: pooled.taskRatePrev, previousObs: pooled.taskObsPrev, range });
  if (taskChange) {
    observations.push({ id: "task-rate-change", text: taskChange.text, evidence: taskChange.evidence });
    if (taskChange.direction === "down") weaknesses.push({ id: "tasks-declining", text: `You completed a smaller share of your goal tasks than ${labels(range).previous}.`, evidence: taskChange.evidence });
    if (taskChange.direction === "up") strengths.push({ id: "tasks-improving", text: `You completed a larger share of your goal tasks than ${labels(range).previous}.`, evidence: taskChange.evidence });
  }

  const { best, worst, enoughData } = pooled.weekdayPattern;
  if (best && worst) {
    observations.push({
      id: "weekday-best",
      text: `${best.name} has your highest completion rate (${pct(best.rate)} of ${best.opportunities} scheduled items), among days with at least ${MIN_WEEKDAY_OBSERVATIONS} scheduled items.`,
      evidence: { best, worst },
    });
    weaknesses.push({ id: "weekday-worst", text: `${worst.name} has your lowest completion rate: ${pct(worst.rate)} of ${worst.opportunities} scheduled items.`, evidence: { worst } });
    recommendations.push({ id: "rec-weekday", text: `Fewer scheduled items get done on ${worst.name}s. Consider planning lighter work for ${worst.name}s, or moving a habit to a day you complete more often, such as ${best.name}.` });
  } else if (!enoughData && pooled.habitObs + pooled.taskObs > 0) {
    observations.push({ id: "weekday-not-enough", text: `Not enough data yet to compare weekdays (each needs at least ${MIN_WEEKDAY_OBSERVATIONS} scheduled items in this period).`, evidence: {} });
  }

  const judged = habits.filter((h) => h.current.rate !== null && h.current.observations >= (h.current.kind === "fixed" ? MIN_HABIT_OBSERVATIONS : 1));
  if (judged.length >= 2) {
    const sorted = [...judged].sort((a, b) => b.current.rate - a.current.rate);
    const [top, bottom] = [sorted[0], sorted.at(-1)];
    if (top.current.rate - bottom.current.rate >= 20) {
      observations.push({ id: "habit-compare", text: `${habitName(top)} has been more consistent than ${habitName(bottom)} ${labels(range).current} (${pct(top.current.rate)} vs ${pct(bottom.current.rate)}).`, evidence: { top: top.current.rate, bottom: bottom.current.rate } });
    }
  }
  for (const h of judged) {
    if (h.current.rate >= STRONG_RATE) strengths.push({ id: `habit-strong-${h.habitId}`, text: `${habitName(h)} is on track: ${pct(h.current.rate)} ${h.current.kind === "fixed" ? `of ${h.current.observations} scheduled days completed` : "of its target reached"}.`, evidence: { rate: h.current.rate, observations: h.current.observations } });
    if (h.current.rate < WEAK_RATE) weaknesses.push({ id: `habit-weak-${h.habitId}`, text: `${habitName(h)} reached ${pct(h.current.rate)} ${h.current.kind === "fixed" ? `of ${h.current.observations} scheduled days` : "of its target"} ${labels(range).current}.`, evidence: { rate: h.current.rate, observations: h.current.observations } });
    if (h.change !== null && h.change <= -MIN_CHANGE_POINTS * 1.5) recommendations.push({ id: `rec-habit-${h.habitId}`, text: `${habitName(h)} dropped ${Math.round(-h.change)} points compared with the previous period. Consider reducing its target or frequency for a while.` });
  }
  // Weekdays vs weekends for one habit: rates compared only with enough scheduled days on each side.
  for (const h of judged.filter((x) => x.current.kind === "fixed")) {
    const side = (days) => h.current.weekdays.filter((w) => days.includes(w.day)).reduce((acc, w) => ({ o: acc.o + w.opportunities, c: acc.c + w.completed }), { o: 0, c: 0 });
    const weekdays = side([1, 2, 3, 4, 5]);
    const weekend = side([0, 6]);
    if (weekdays.o >= MIN_WEEKDAY_OBSERVATIONS && weekend.o >= MIN_WEEKDAY_OBSERVATIONS) {
      const a = (weekdays.c / weekdays.o) * 100;
      const b = (weekend.c / weekend.o) * 100;
      if (Math.abs(a - b) >= 20) {
        const better = a > b ? "on weekdays than at weekends" : "at weekends than on weekdays";
        observations.push({ id: `habit-weekend-${h.habitId}`, text: `You complete ${habitName(h)} more consistently ${better} (${pct(Math.max(a, b))} vs ${pct(Math.min(a, b))}).`, evidence: { weekdays, weekend } });
      }
    }
  }
  for (const h of habits) {
    if (h.streaks.current >= LONG_STREAK && h.streaks.unit === "occurrences") strengths.push({ id: `habit-streak-${h.habitId}`, text: `${habitName(h)} is on a ${h.streaks.current}-occurrence streak.`, evidence: h.streaks });
  }

  if (pooled.habitRate !== null && pooled.habitObs >= MIN_RATE_OBSERVATIONS && pooled.habitRate >= STRONG_RATE && pooled.habitMissed > 0) {
    strengths.push({ id: "consistent-despite-misses", text: `You kept a consistent routine (${pct(pooled.habitRate)} of scheduled habit occurrences) despite ${pooled.habitMissed} missed ${pooled.habitMissed === 1 ? "day" : "days"}.`, evidence: { rate: pooled.habitRate, missed: pooled.habitMissed } });
  }

  for (const g of goals.filter((x) => x.status === "active")) {
    const m = g.momentum;
    if (m.runningDays && m.previous14 > 0 && m.recent14 < m.previous14 / 2) {
      weaknesses.push({ id: `goal-slowing-${g.goalId}`, text: `Progress on “${g.title}” has slowed during the last two weeks (${m.recent14} points vs ${m.previous14} in the two weeks before).`, evidence: m });
    }
    if (g.startDate <= shiftBack(range.today, STALL_DAYS) && m.recent14 === 0 && g.overallProgress < 100) {
      weaknesses.push({ id: `goal-stalled-${g.goalId}`, text: `“${g.title}” has no recorded progress in the last ${STALL_DAYS} days.`, evidence: m });
      recommendations.push({ id: `rec-goal-${g.goalId}`, text: `“${g.title}” has had little recorded progress recently. Consider reviewing its remaining tasks or adjusting its plan.` });
    } else if (m.recent14 > 0 && m.previous14 > 0 && m.recent14 >= m.previous14) {
      strengths.push({ id: `goal-sustained-${g.goalId}`, text: `“${g.title}” kept making progress over the last four weeks.`, evidence: m });
    }
  }

  if (pooled.activityStreak.current >= LONG_STREAK) strengths.push({ id: "activity-streak", text: `You have recorded activity on ${pooled.activityStreak.current} days in a row.`, evidence: pooled.activityStreak });

  return finish({ observations, strengths, weaknesses, recommendations, hasData: pooled.habitObs + pooled.taskObs > 0 });
}

/** Statements for one habit. */
function habitNarrative(h, range) {
  const observations = [];
  const strengths = [];
  const weaknesses = [];
  const recommendations = [];
  const c = h.current;
  const { current: now, previous: before } = labels(range);

  if (c.kind === "fixed") {
    if (c.opportunities > 0) observations.push({ id: "rate", text: `You completed ${c.completed} of ${c.opportunities} scheduled days ${now}${c.partial ? `, plus ${c.partial} partly` : ""}.`, evidence: { completed: c.completed, partial: c.partial, opportunities: c.opportunities } });
  } else if (h.currentPeriod) {
    const p = h.currentPeriod;
    observations.push({ id: "period", text: `${p.ended ? "This" : "Current"} ${c.periodType}: ${p.credit} of ${p.target} sessions${p.ended ? "" : " so far"}.`, evidence: p });
  }
  const change = compareRates({ subject: c.kind === "fixed" ? "scheduled days" : "target", current: c.rate, currentObs: c.observations * (c.kind === "fixed" ? 1 : MIN_RATE_OBSERVATIONS), previous: h.previous.rate, previousObs: h.previous.observations * (c.kind === "fixed" ? 1 : MIN_RATE_OBSERVATIONS), range });
  if (change) {
    observations.push({ id: "change", text: change.text, evidence: change.evidence });
    if (change.direction === "up") strengths.push({ id: "improving", text: `Improved compared with ${before}.`, evidence: change.evidence });
    if (change.direction === "down") {
      weaknesses.push({ id: "declining", text: `Lower than ${before}.`, evidence: change.evidence });
      recommendations.push({ id: "rec-decline", text: "Completion has fallen compared with the previous period. Consider reducing the target or the number of scheduled days temporarily." });
    }
  }
  if (h.weekdayPattern.best && h.weekdayPattern.worst) {
    strengths.push({ id: "best-day", text: `${h.weekdayPattern.best.name} is your most consistent day (${pct(h.weekdayPattern.best.rate)} of ${h.weekdayPattern.best.opportunities}).`, evidence: h.weekdayPattern.best });
    weaknesses.push({ id: "worst-day", text: `${h.weekdayPattern.worst.name} is missed most often relative to how often it is scheduled (${pct(h.weekdayPattern.worst.rate)} of ${h.weekdayPattern.worst.opportunities} completed).`, evidence: h.weekdayPattern.worst });
    recommendations.push({ id: "rec-day", text: `Consider whether ${h.weekdayPattern.worst.name} is a realistic day for this habit, or plan a smaller version of it on ${h.weekdayPattern.worst.name}s.` });
  }
  if (h.streaks.current >= LONG_STREAK) strengths.push({ id: "streak", text: `Current streak: ${h.streaks.current} ${h.streaks.unit}.`, evidence: h.streaks });
  if (c.rate !== null && c.observations >= (c.kind === "fixed" ? MIN_HABIT_OBSERVATIONS : 1)) {
    if (c.rate >= STRONG_RATE) strengths.push({ id: "strong", text: `${pct(c.rate)} ${c.kind === "fixed" ? "completion rate" : "of target reached"} ${now}.`, evidence: { rate: c.rate } });
    if (c.rate < WEAK_RATE) weaknesses.push({ id: "weak", text: `${pct(c.rate)} ${c.kind === "fixed" ? "completion rate" : "of target reached"} ${now}.`, evidence: { rate: c.rate } });
  }
  if (c.kind === "fixed" && c.partial >= 3 && c.partial >= c.completed) {
    recommendations.push({ id: "rec-partial", text: `Many days were only partly done (${c.partial}). Consider whether a smaller daily target would be easier to complete fully.` });
  }
  return finish({ observations, strengths, weaknesses, recommendations, hasData: h.enoughData });
}

/** Statements for one goal. */
function goalNarrative(g, range) {
  const observations = [];
  const strengths = [];
  const weaknesses = [];
  const recommendations = [];
  const c = g.current;
  const { current: now, previous: before } = labels(range);

  observations.push({ id: "progress", text: `The goal gained ${c.progressMade} progress points ${now} and is at ${Math.round(g.overallProgress)}% overall.`, evidence: { progressMade: c.progressMade, overall: g.overallProgress } });
  if (c.scheduled > 0) observations.push({ id: "tasks", text: `You completed ${c.completed} of ${c.scheduled} scheduled task occurrences ${now}.`, evidence: { completed: c.completed, scheduled: c.scheduled } });
  const change = compareRates({ subject: "scheduled tasks", current: c.completionRate, currentObs: c.scheduled, previous: g.previous.completionRate, previousObs: g.previous.scheduled, range });
  if (change) {
    observations.push({ id: "change", text: change.text, evidence: change.evidence });
    if (change.direction === "down") weaknesses.push({ id: "declining", text: `Fewer of the scheduled tasks were completed than ${before}.`, evidence: change.evidence });
    if (change.direction === "up") strengths.push({ id: "improving", text: `More of the scheduled tasks were completed than ${before}.`, evidence: change.evidence });
  }
  const m = g.momentum;
  if (g.status === "active" && m.runningDays && m.previous14 > 0 && m.recent14 < m.previous14 / 2) {
    weaknesses.push({ id: "slowing", text: `Progress has slowed during the last two weeks (${m.recent14} vs ${m.previous14} points).`, evidence: m });
  }
  if (g.status === "active" && g.startDate <= shiftBack(range.today, STALL_DAYS) && m.recent14 === 0 && g.overallProgress < 100) {
    weaknesses.push({ id: "stalled", text: `No recorded progress in the last ${STALL_DAYS} days.`, evidence: m });
    recommendations.push({ id: "rec-review", text: "This goal has had little recorded progress recently. Consider reviewing its remaining tasks." });
  }
  if (g.weekdayPattern.best && g.weekdayPattern.worst) {
    strengths.push({ id: "best-day", text: `${g.weekdayPattern.best.name} is your most productive day for this goal (${pct(g.weekdayPattern.best.rate)} of ${g.weekdayPattern.best.opportunities} scheduled tasks).`, evidence: g.weekdayPattern.best });
    recommendations.push({ id: "rec-day", text: `You complete more of this goal's tasks on ${g.weekdayPattern.best.name}s. Consider placing harder tasks there.` });
  }
  if (g.streaks.current >= LONG_STREAK) strengths.push({ id: "streak", text: `Activity on ${g.streaks.current} days in a row.`, evidence: g.streaks });
  const overdue = c.remaining;
  if (g.basis === "roadmap" && overdue >= 3 && g.status === "active") recommendations.push({ id: "rec-overdue", text: `${overdue} scheduled roadmap tasks from this period are still open. Consider catching up on the oldest ones first.` });
  return finish({ observations, strengths, weaknesses, recommendations, hasData: c.scheduled > 0 || c.progressMade > 0 });
}

function shiftBack(key, days) {
  return new Date(Date.parse(`${key}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

function finish({ observations, strengths, weaknesses, recommendations, hasData }) {
  return {
    hasData,
    message: hasData ? null : "Not enough data yet — insights appear once there are scheduled days with recorded activity.",
    observations,
    strengths,
    weaknesses,
    recommendations: recommendations.slice(0, MAX_RECOMMENDATIONS),
  };
}

module.exports = {
  overviewNarrative,
  habitNarrative,
  goalNarrative,
  thresholds: { MIN_RATE_OBSERVATIONS, MIN_CHANGE_POINTS, STRONG_RATE, WEAK_RATE, MIN_HABIT_OBSERVATIONS, MIN_WEEKDAY_OBSERVATIONS, STALL_DAYS, LONG_STREAK },
};
