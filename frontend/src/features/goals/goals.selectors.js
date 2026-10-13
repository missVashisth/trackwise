// Pure functions that derive view data from raw goals. No React here, so
// they are trivially unit-testable and reusable by any hook or component.

import { COLOR_HEX, COUNT_METRICS, GROUPING, IMPACT_WEIGHT, STATUS_FILTER } from "./goals.constants.js";
import { parseDate, quarterOf } from "../../lib/date.js";

const clamp = (n) => Math.min(100, Math.max(0, n));

/** Task-based progress from the backend (ticked tasks × weightage over the goal's days). */
export function getProgress(goal) {
  if (goal.progress) return clamp(Math.round(goal.progress.overall));
  const metric = goal.metric;
  if (!metric || !metric.target) return 0;
  return clamp(Math.round((Number(metric.current || 0) / Number(metric.target)) * 100));
}

export function isCountMetric(goal) {
  return COUNT_METRICS.has(goal.metric?.type);
}

export function isCompleted(goal) {
  return Boolean(goal.completedAt);
}

export function isTopLevel(goal) {
  return !goal.parentGoalId;
}

export function getGoalColorHex(goal, lifeArea) {
  return COLOR_HEX[goal.color] ?? lifeArea?.colorHex ?? COLOR_HEX.indigo;
}

export function formatMetricValue(metric) {
  if (!metric) return "";
  const { current = 0, target = 0, unit = "", prefix } = metric;
  const fmt = (n) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
  return prefix ? `${unit}${fmt(current)} / ${unit}${fmt(target)}` : `${fmt(current)} / ${fmt(target)} ${unit}`.trim();
}

export function filterGoals(goals, filters) {
  const { status = STATUS_FILTER.ACTIVE, lifeAreaIds = [], impacts = [] } = filters ?? {};

  return goals.filter((goal) => {
    if (status === STATUS_FILTER.ACTIVE && isCompleted(goal)) return false;
    if (status === STATUS_FILTER.COMPLETED && !isCompleted(goal)) return false;
    if (lifeAreaIds.length && !lifeAreaIds.includes(goal.lifeAreaId)) return false;
    if (impacts.length && !impacts.includes(goal.impact)) return false;
    return true;
  });
}

function compareDates(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da && !db) return 0;
  if (!da) return 1; // missing dates sort last
  if (!db) return -1;
  return da - db;
}

const COMPARATORS = {
  title: (a, b) => a.title.localeCompare(b.title),
  progress: (a, b) => getProgress(a) - getProgress(b),
  impact: (a, b) => (IMPACT_WEIGHT[b.impact] ?? 0) - (IMPACT_WEIGHT[a.impact] ?? 0),
  startDate: (a, b) => compareDates(a.startDate, b.startDate),
  deadline: (a, b) => compareDates(a.deadline, b.deadline),
  tasksCount: (a, b) => (a.tasksCount ?? 0) - (b.tasksCount ?? 0),
};

/** Sort by a column, breaking ties by deadline (earliest first) like Griply. */
export function sortGoals(goals, sortKey = "deadline", sortDir = "asc") {
  const primary = COMPARATORS[sortKey] ?? COMPARATORS.deadline;
  const direction = sortDir === "desc" ? -1 : 1;

  return [...goals].sort((a, b) => {
    const result = primary(a, b) * direction;
    return result !== 0 ? result : compareDates(a.deadline, b.deadline);
  });
}

/** Returns [{ key, label, lifeArea?, goals }] in display order. */
export function groupGoals(goals, grouping, lifeAreas = []) {
  if (grouping === GROUPING.LIFE_AREA) {
    const byArea = new Map(lifeAreas.map((area) => [area.id, []]));
    const orphans = [];

    for (const goal of goals) {
      if (byArea.has(goal.lifeAreaId)) byArea.get(goal.lifeAreaId).push(goal);
      else orphans.push(goal);
    }

    const groups = lifeAreas
      .filter((area) => byArea.get(area.id).length > 0)
      .map((area) => ({ key: area.id, label: area.name, lifeArea: area, goals: byArea.get(area.id) }));

    if (orphans.length) groups.push({ key: "none", label: "No life area", goals: orphans });
    return groups;
  }

  if (grouping === GROUPING.DEADLINE) {
    const byQuarter = new Map();
    const noDeadline = [];

    for (const goal of goals) {
      const quarter = quarterOf(goal.deadline);
      if (!quarter) {
        noDeadline.push(goal);
        continue;
      }
      if (!byQuarter.has(quarter.key)) byQuarter.set(quarter.key, { key: quarter.key, label: quarter.label, goals: [] });
      byQuarter.get(quarter.key).goals.push(goal);
    }

    const groups = [...byQuarter.values()].sort((a, b) => a.key.localeCompare(b.key));
    if (noDeadline.length) groups.push({ key: "no-deadline", label: "No deadline", goals: noDeadline });
    return groups;
  }

  return [{ key: "all", label: null, goals }];
}

/** Map of parentGoalId -> subgoals[] */
export function indexSubgoals(goals) {
  const index = new Map();
  for (const goal of goals) {
    if (!goal.parentGoalId) continue;
    if (!index.has(goal.parentGoalId)) index.set(goal.parentGoalId, []);
    index.get(goal.parentGoalId).push(goal);
  }
  for (const list of index.values()) list.sort((a, b) => compareDates(a.deadline, b.deadline));
  return index;
}
