// API layer (real backend).
//
//   GET    /api/goals              -> { today, Count, Data: Goal[] }
//   GET    /api/goals/:id          -> { goal: Goal }
//   GET    /api/goals/:id/insights -> { insights: GoalInsights }   (goal dashboard history)
//   POST   /api/goals              -> { goal: Goal }
//   PATCH  /api/goals/:id          -> { goal: Goal }
//   DELETE /api/goals/:id          -> { deletedGoalIds: string[] }
//   GET    /api/life-areas         -> { lifeAreas: LifeArea[] }
//
//   Goal {
//     _id, title, description, lifeAreaId | null, parentGoalId | null,
//     impact: "high" | "medium" | "low",
//     status: "upcoming" | "active" | "ended" | "completed",   // on the user's today
//     startDate, totalDays, deadline (last day, derived), isActive, isOngoing,
//     metric: { type, current, target, unit, prefix },
//     history: number[], color: string | null, isFavorite: boolean,
//     completedAt: ISO string | null,
//     progress: { overall, today, history }   // from ticked tasks, in %
//   }
//   LifeArea { _id, name, emoji, colorHex }

import { http } from "../../../lib/http.js";

const withId = ({ _id, ...rest }) => ({ id: _id, ...rest });

export const goalsApi = {
  async getGoal(id) {
    const { goal } = await http.get(`/goals/${id}`);
    return withId(goal);
  },

  async getInsights(id) {
    const { insights } = await http.get(`/goals/${id}/insights`);
    return insights;
  },

  async listGoals() {
    const { Data = [] } = await http.get("/goals");
    return { goals: Data.map(withId) };
  },

  async createGoal(payload) {
    const { goal } = await http.post("/goals", payload);
    return { goal: withId(goal) };
  },

  async updateGoal(id, patch) {
    const { goal } = await http.patch(`/goals/${id}`, patch);
    return { goal: withId(goal) };
  },

  deleteGoal: (id) => http.delete(`/goals/${id}`),

  async listLifeAreas() {
    const { lifeAreas = [] } = await http.get("/life-areas");
    return { lifeAreas: lifeAreas.map(withId) };
  },
};
