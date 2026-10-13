// API layer for Insights. All calculations happen on the server; these return its reports as-is.
//
//   GET /api/insights/overview?period=week|month|custom&date=&from=&to=
//   GET /api/insights/goals/:goalId?...
//   GET /api/insights/habits/:habitId?...
//   GET /api/insights/challenges?...    (challenge attempts; kept separate from goals and habits)

import { http } from "../../../lib/http.js";
import { periodQueryString } from "../insights.format.js";

export const insightsApi = {
  overview: (period) => http.get(`/insights/overview?${periodQueryString(period)}`),
  goal: (goalId, period) => http.get(`/insights/goals/${goalId}?${periodQueryString(period)}`),
  habit: (habitId, period) => http.get(`/insights/habits/${habitId}?${periodQueryString(period)}`),
  challenges: (period) => http.get(`/insights/challenges?${periodQueryString(period)}`),
};
