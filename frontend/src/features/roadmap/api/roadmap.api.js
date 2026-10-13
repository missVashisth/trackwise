// API layer for AI roadmaps.
//
//   POST /api/roadmaps/generate  { goal | goalId, preferences?, previousDraft? } -> { draft }   (not saved)
//   POST /api/roadmaps/confirm   { requestId, goal | goalId, draft }             -> { goal, created }
//   GET  /api/goals/:id/roadmap                                                  -> grouped roadmap tasks
//
//   Draft { summary, phases: [{ title, description, startDay, endDay }],
//           days: [{ day, date, focus, tasks: [{ itemId, title, description, estimatedMinutes }] }],
//           totalTasks, goal, preferences, tailored, model, generatedAt }

import { http } from "../../../lib/http.js";

const withId = ({ _id, ...rest }) => ({ id: _id, ...rest });

export const roadmapApi = {
  async generate(body) {
    // Long plans take a while to generate; the server gives up on the AI first (with a clear error).
    const { draft } = await http.post("/roadmaps/generate", body, { timeoutMs: 11 * 60_000 });
    return draft;
  },

  async confirm(body) {
    const { goal, created } = await http.post("/roadmaps/confirm", body);
    return { goal: withId(goal), created };
  },
};
