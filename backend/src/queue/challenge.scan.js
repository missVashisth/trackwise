// Challenge notifications, run by the existing reminder job (same schedule, same local reminder
// time as task reminders). For each running enrollment, at most ONE challenge notification per
// local day, in this order of importance:
//   finished (the day after the last day) > ending (3 days or fewer left) > weekly report
//   (first scan after each challenge week ends) > daily reminder (required activities still open).
// Every message also has its own dedupeKey, so re-runs, overlapping workers or restarts can't
// duplicate anything. Email only when the participant opted in for that challenge.

const ChallengeEnrollment = require("../models/challengeEnrollment.model");
const ChallengeLog = require("../models/challengeLog.model");
const Notification = require("../models/notification.model");
const User = require("../models/user.model");
const { notify } = require("../services/notifications/notification.service");
const { buildReport, shiftKey, daysBetween } = require("../services/challenges/challengeReport");
const { resolveTimeZone, toDateKey, localMinutesOfDay } = require("../utils/date");
const logger = require("../utils/logger");

const ENDING_SOON_DAYS = 3;
const LOOKBACK_DAYS = 8; // enough logs for yesterday and the week that just ended

/**
 * Messages that apply to one enrollment today, most important first. Pure; exported for tests.
 * One-time messages (finished, ending, a week's report) keep applying on later days, so the scan
 * skips those already sent and takes the next candidate (usually the daily reminder).
 */
function candidates(enrollment, logs, today) {
  const id = String(enrollment._id);
  const base = { enrollmentId: id, challengeTitle: enrollment.title, date: today };
  const report = buildReport(enrollment, logs, today);
  if (today > enrollment.endDate) {
    return [{ type: "CHALLENGE_FINISHED", dedupeKey: `CHALLENGE_FINISHED:${id}`, data: { ...base, outcome: report.outcome?.text ?? null }, close: true }];
  }
  if (today < enrollment.startDate) return [];

  const list = [];
  const daysLeft = daysBetween(today, enrollment.endDate) + 1;
  if (daysLeft <= ENDING_SOON_DAYS && enrollment.durationDays > ENDING_SOON_DAYS) {
    list.push({ type: "CHALLENGE_ENDING", dedupeKey: `CHALLENGE_ENDING:${id}`, data: { ...base, daysLeft } });
  }

  // The most recent finished challenge week (an older week's report is never sent late).
  const dayNumber = daysBetween(enrollment.startDate, today) + 1;
  const lastFinishedWeek = Math.floor((dayNumber - 1) / 7);
  const week = lastFinishedWeek >= 1 ? report.weeks[lastFinishedWeek - 1] : null;
  if (enrollment.reminders?.weekly !== false && week?.finished) {
    list.push({
      type: "CHALLENGE_WEEKLY",
      dedupeKey: `CHALLENGE_WEEKLY:${id}:${week.week}`,
      data: { ...base, week: week.week, completeDays: week.completeDays, requiredAdherence: week.requiredAdherence },
    });
  }

  const todayEntry = report.todaySummary;
  const remaining = todayEntry ? todayEntry.requiredTotal - todayEntry.requiredMet : 0;
  if (enrollment.reminders?.daily !== false && remaining > 0) {
    const yesterday = report.days.find((d) => d.dateKey === shiftKey(today, -1));
    const missedYesterday = Boolean(yesterday && yesterday.requiredTotal > yesterday.requiredMet && yesterday.status !== "rest");
    list.push({ type: "CHALLENGE_REMINDER", dedupeKey: `CHALLENGE_REMINDER:${id}:${today}`, data: { ...base, remaining, missedYesterday } });
  }
  return list;
}

/** The message to send today: the first candidate not already sent (null when none). */
function decide(enrollment, logs, today, alreadySent = new Set()) {
  return candidates(enrollment, logs, today).find((c) => !alreadySent.has(c.dedupeKey)) ?? null;
}

/**
 * @param {object} options
 * @param {Date} [options.now]
 * @param {number} [options.dueAt] - local minutes after midnight when users are notified
 */
async function runChallengeScan({ now = new Date(), dueAt = 20 * 60, batchSize = 200 } = {}) {
  const startedAt = Date.now();
  const summary = { scanned: 0, notYetDue: 0, sent: 0, alreadyToday: 0, nothingToSend: 0 };
  // Active runs, plus runs that ended in the last few days (for the "finished" message).
  const earliestEnd = shiftKey(now.toISOString().slice(0, 10), -3);
  let lastId = null;

  for (;;) {
    const enrollments = await ChallengeEnrollment.find({
      status: { $in: ["active", "completed"] },
      endDate: { $gte: earliestEnd },
      ...(lastId ? { _id: { $gt: lastId } } : {}),
    })
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();
    if (!enrollments.length) break;
    lastId = enrollments[enrollments.length - 1]._id;
    summary.scanned += enrollments.length;

    const users = await User.find({ _id: { $in: [...new Set(enrollments.map((e) => String(e.userId)))] } }, { timezone: 1 }).lean();
    const zoneOf = new Map(users.map((u) => [String(u._id), resolveTimeZone(u.timezone)]));

    const due = [];
    for (const enrollment of enrollments) {
      const zone = zoneOf.get(String(enrollment.userId));
      if (!zone) continue;
      if (localMinutesOfDay(now, zone) < dueAt) {
        summary.notYetDue += 1;
        continue;
      }
      due.push({ enrollment, today: toDateKey(now, zone) });
    }
    if (!due.length) continue;

    // One query each for recent logs and for today's already-sent challenge notifications.
    const oldest = due.reduce((min, d) => (d.today < min ? d.today : min), due[0].today);
    const [logs, sentToday] = await Promise.all([
      ChallengeLog.find(
        { enrollmentId: { $in: due.map((d) => d.enrollment._id) }, dateKey: { $gte: shiftKey(oldest, -LOOKBACK_DAYS) } },
        { enrollmentId: 1, activityKey: 1, dateKey: 1, progressPercent: 1 },
      ).lean(),
      Notification.find(
        {
          "metadata.enrollmentId": { $in: due.map((d) => String(d.enrollment._id)) },
          "metadata.date": { $in: [...new Set(due.map((d) => d.today))] },
          channel: Notification.CHANNELS.IN_APP,
        },
        { "metadata.enrollmentId": 1, "metadata.date": 1 },
      ).lean(),
    ]);
    const logsBy = new Map();
    for (const log of logs) {
      const key = String(log.enrollmentId);
      if (!logsBy.has(key)) logsBy.set(key, []);
      logsBy.get(key).push(log);
    }
    const notifiedOn = new Set(sentToday.map((n) => `${n.metadata.enrollmentId}|${n.metadata.date}`));
    // Which one-time messages already exist (one query for the batch).
    const options = due.map((d) => ({ ...d, list: candidates(d.enrollment, logsBy.get(String(d.enrollment._id)) ?? [], d.today) }));
    const keys = options.flatMap((o) => o.list.map((c) => `${c.dedupeKey}:${Notification.CHANNELS.IN_APP}`));
    const existing = keys.length ? await Notification.find({ dedupeKey: { $in: keys } }, { dedupeKey: 1 }).lean() : [];
    const alreadySent = new Set(existing.map((n) => n.dedupeKey.replace(/:IN_APP$/, "")));

    for (const { enrollment, today, list } of options) {
      const id = String(enrollment._id);
      const decision = list.find((c) => !alreadySent.has(c.dedupeKey)) ?? null;
      // A run past its last day is closed whether or not its "finished" message was sent already.
      if (list[0]?.close && enrollment.status === "active") {
        await ChallengeEnrollment.updateOne({ _id: enrollment._id, status: "active" }, { $set: { status: "completed", completedAt: now } });
      }
      if (!decision) {
        summary.nothingToSend += 1;
        continue;
      }
      if (notifiedOn.has(`${id}|${today}`)) {
        summary.alreadyToday += 1;
        continue;
      }
      try {
        const created = await notify({
          userId: enrollment.userId,
          type: decision.type,
          data: decision.data,
          dedupeKey: decision.dedupeKey,
          channels: enrollment.reminders?.email ? undefined : [Notification.CHANNELS.IN_APP],
        });
        if (created.length) summary.sent += 1;
      } catch (err) {
        // One participant's failure must not stop the scan for everyone else.
        logger.error("challenge_scan.notify_failed", { enrollmentId: id, type: decision.type, error: err.message });
      }
    }
  }

  logger.info("scheduler.challenge_scan_done", { ...summary, ms: Date.now() - startedAt });
  return summary;
}

module.exports = { runChallengeScan, decide, candidates };
