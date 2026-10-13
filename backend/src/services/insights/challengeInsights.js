// Insights for the user's challenges over an Insights period. Kept separate from goal progress and
// habit completion (no combined score). Source of truth: the participant's own ChallengeLogs, read
// through the same report as the challenge page, so both always agree.

const ChallengeEnrollment = require("../../models/challengeEnrollment.model");
const ChallengeLog = require("../../models/challengeLog.model");
const { buildReport } = require("../challenges/challengeReport");
const { parsePeriod, shiftKey, weekdayOf } = require("./period");
const { getTodayDateKey } = require("../../utils/date");

const MIN_COMPARE = 5; // required activities needed in each period to compare them
const MIN_WEEKDAY = 4; // finished days per weekday before naming a strongest/weakest day
const MIN_WEEKDAY_SPREAD = 15;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

/** Required-activity results over finished days in [from, to]. */
function periodStats(days, from, to, today) {
  const span = days.filter((d) => d.dateKey >= from && d.dateKey <= to && d.dateKey < today && ["complete", "partial", "missed"].includes(d.status));
  const requiredTotal = span.reduce((s, d) => s + d.requiredTotal, 0);
  const requiredMet = span.reduce((s, d) => s + d.requiredMet, 0);
  return {
    days: span.length,
    completeDays: span.filter((d) => d.status === "complete").length,
    requiredTotal,
    requiredMet,
    requiredMissed: requiredTotal - requiredMet,
    requiredAdherence: pct(requiredMet, requiredTotal),
  };
}

function weekdayPattern(days, today) {
  const finished = days.filter((d) => d.dateKey < today && d.requiredTotal > 0 && d.status !== "rest");
  const byDay = WEEKDAYS.map((name, index) => {
    const own = finished.filter((d) => weekdayOf(d.dateKey) === index);
    const total = own.reduce((s, d) => s + d.requiredTotal, 0);
    return { name, days: own.length, rate: pct(own.reduce((s, d) => s + d.requiredMet, 0), total) };
  });
  const eligible = byDay.filter((d) => d.days >= MIN_WEEKDAY);
  if (eligible.length < 2) return { weekdays: byDay, strongest: null, weakest: null, minDays: MIN_WEEKDAY };
  const sorted = [...eligible].sort((a, b) => b.rate - a.rate);
  const spread = sorted[0].rate - sorted[sorted.length - 1].rate;
  return spread >= MIN_WEEKDAY_SPREAD
    ? { weekdays: byDay, strongest: sorted[0], weakest: sorted[sorted.length - 1], minDays: MIN_WEEKDAY }
    : { weekdays: byDay, strongest: null, weakest: null, minDays: MIN_WEEKDAY };
}

async function getChallengeInsights(userId, timeZone, query) {
  const today = getTodayDateKey(timeZone);
  const { range, error } = parsePeriod(query, today);
  if (error) return { error };

  // Attempts that overlap the period or the one before it (for the comparison).
  const enrollments = await ChallengeEnrollment.find({
    userId,
    startDate: { $lte: range.to },
    endDate: { $gte: range.prev.from },
  })
    .sort({ startDate: -1 })
    .limit(20)
    .lean();
  const logs = enrollments.length
    ? await ChallengeLog.find({ enrollmentId: { $in: enrollments.map((e) => e._id) } }, { enrollmentId: 1, activityKey: 1, dateKey: 1, progressPercent: 1 }).lean()
    : [];
  const logsBy = new Map();
  for (const log of logs) {
    const key = String(log.enrollmentId);
    if (!logsBy.has(key)) logsBy.set(key, []);
    logsBy.get(key).push(log);
  }

  const items = enrollments.map((enrollment) => {
    const report = buildReport(enrollment, logsBy.get(String(enrollment._id)) ?? [], today);
    const current = periodStats(report.days, range.from, range.to, today);
    const previous = periodStats(report.days, range.prev.from, range.prev.to, today);
    const comparable = current.requiredTotal >= MIN_COMPARE && previous.requiredTotal >= MIN_COMPARE;
    return {
      id: String(enrollment._id),
      title: enrollment.title,
      category: enrollment.category,
      status: enrollment.status,
      phase: report.phase,
      strict: report.strict,
      startDate: enrollment.startDate,
      endDate: enrollment.endDate,
      progress: { currentDay: report.currentDay, durationDays: enrollment.durationDays, daysRemaining: report.daysRemaining },
      period: current,
      previous,
      change: comparable ? Math.round((current.requiredAdherence - previous.requiredAdherence) * 10) / 10 : null,
      overall: report.totals,
      daily: report.days
        .filter((d) => d.dateKey >= range.from && d.dateKey <= range.to)
        .map((d) => ({ dateKey: d.dateKey, day: d.day, status: d.status, requiredMet: d.requiredMet, requiredTotal: d.requiredTotal, rate: d.dateKey < today && d.requiredTotal ? pct(d.requiredMet, d.requiredTotal) : null })),
      weeks: report.weeks,
      byActivity: report.byActivity,
      pattern: weekdayPattern(report.days, today),
      streak: report.streak,
    };
  });

  return {
    report: {
      range: { ...range, prev: range.prev, today },
      hasData: items.some((i) => i.period.days > 0 || i.phase === "running"),
      enrollments: items,
      thresholds: { MIN_COMPARE, MIN_WEEKDAY, MIN_WEEKDAY_SPREAD },
      definitions: {
        requiredAdherence: "Required activities done ÷ required activities scheduled on finished days. Today counts once it's over; rest days and optional activities are left out.",
        completeDays: "Finished days on which every required activity was done.",
      },
    },
  };
}

module.exports = { getChallengeInsights, periodStats, shiftKey };
