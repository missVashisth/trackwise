// API layer for habits (all requests carry the auth cookie through lib/http).
//
//   GET    /api/habits?status=active|archived|all      -> { today, timeZone, habits: Habit[] }
//   POST   /api/habits                                 -> { habit }
//   GET    /api/habits/:id                             -> { today, habit }
//   PATCH  /api/habits/:id                             -> { habit }
//   POST   /api/habits/:id/archive | /restore          -> { habit }
//   PATCH  /api/habits/:id/milestones/:milestoneId     -> { habit }        ({ completed })
//   PUT    /api/habits/:id/logs/:dateKey               -> { log, habit }   ({ progressPercent } | { actualValue } | { completed }, note?)
//   DELETE /api/habits/:id/logs/:dateKey               -> { habit }
//   GET    /api/habits/:id/logs?from&to                -> { today, from, to, logs, days }
//
//   Habit { _id, title, motivation, description, lifeAreaId, icon, color,
//           schedule: { type, weekdays?, timesPerPeriod? }, startDate, endDate,
//           trackingMethod, targetValue, unit, milestones[], archivedAt, isArchived,
//           today: { dateKey, requirement, status, log }, period }

import { http } from "../../../lib/http.js";

const withId = ({ _id, ...rest }) => ({ id: _id, ...rest });
const toHabit = (habit) => withId({ ...habit, milestones: (habit.milestones ?? []).map(withId) });

export const habitsApi = {
  async list(status = "active") {
    const { today, habits = [] } = await http.get(`/habits?status=${status}`);
    return { today, habits: habits.map(toHabit) };
  },

  async get(id) {
    const { today, habit } = await http.get(`/habits/${id}`);
    return { today, habit: toHabit(habit) };
  },

  async create(payload) {
    const { habit } = await http.post("/habits", payload);
    return toHabit(habit);
  },

  async update(id, patch) {
    const { habit } = await http.patch(`/habits/${id}`, patch);
    return toHabit(habit);
  },

  async archive(id) {
    return toHabit((await http.post(`/habits/${id}/archive`)).habit);
  },

  async restore(id) {
    return toHabit((await http.post(`/habits/${id}/restore`)).habit);
  },

  async setMilestone(id, milestoneId, completed) {
    return toHabit((await http.patch(`/habits/${id}/milestones/${milestoneId}`, { completed })).habit);
  },

  async log(id, dateKey, entry) {
    const { log, habit } = await http.put(`/habits/${id}/logs/${dateKey}`, entry);
    return { log, habit: toHabit(habit) };
  },

  async clearLog(id, dateKey) {
    return toHabit((await http.delete(`/habits/${id}/logs/${dateKey}`)).habit);
  },

  history: (id, { from, to } = {}) => {
    const query = new URLSearchParams(Object.entries({ from, to }).filter(([, v]) => v)).toString();
    return http.get(`/habits/${id}/logs${query ? `?${query}` : ""}`);
  },
};
