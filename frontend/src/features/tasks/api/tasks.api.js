// API layer for tasks. Every mutation also returns the goal's recalculated
// progress ({ overall, today, history }) so the UI can update it in place.
//
//   GET    /api/tasks                                        -> { today, Tasks: Task[] }
//   POST   /api/goals/:goalId/tasks                          -> { task, goalProgress }
//   PATCH  /api/goals/:goalId/tasks/:taskId                  -> { task, goalProgress }
//   DELETE /api/goals/:goalId/tasks/:taskId                  -> { task, goalProgress }
//   POST   /api/goals/:goalId/tasks/:taskId/complete         -> { task?, goalProgress }  (roadmap tasks: once)
//   POST   /api/goals/:goalId/tasks/:taskId/reopen           -> { task, goalProgress }   (roadmap tasks only)
//   DELETE /api/goals/:goalId/tasks/:taskId/completions/:day -> { goalProgress }
//
//   POST   /api/tasks                                        -> { task }   (to-do without a goal; { title, dueDate, priority? })
//   PATCH  /api/tasks/:taskId                                -> { task }   ({ title?, dueDate?, completed?, priority? })
//   DELETE /api/tasks/:taskId                                -> { task }
//
//   Task { _id, goalId | null, kind?, title, weightage?, dueDate?, completedAt?, completedToday,
//          scheduledDate?, originalScheduledDate?, roadmapDay?, roadmapOrder?, description?,
//          estimatedMinutes?, roadmapStatus? }
//   A task with goalId === null is a standalone to-do. kind "roadmap" is a one-time goal task
//   scheduled for one day (roadmapStatus: today | pending | upcoming | completed, from the server);
//   other goal tasks recur daily.

import { http } from "../../../lib/http.js";

export const toTask = ({
  _id, goalId = null, kind, title, weightage, dueDate = null, completedAt = null, completedToday = false,
  scheduledDate = null, originalScheduledDate = null, roadmapDay = null, roadmapOrder = 0, description = "",
  estimatedMinutes = null, roadmapStatus = null, source = null, priority = null,
}) => ({
  id: _id,
  goalId,
  isTodo: !goalId,
  isRoadmap: kind === "roadmap",
  title,
  weightage,
  dueDate,
  completedAt,
  completedToday,
  scheduledDate,
  originalScheduledDate,
  roadmapDay,
  roadmapOrder,
  description,
  estimatedMinutes,
  roadmapStatus,
  source,
  priority,
});

// Only the fields each kind accepts.
const taskPayload = ({ title, weightage, kind, scheduledDate, day, description, estimatedMinutes }) =>
  kind === "roadmap" ? { title, kind, scheduledDate, day, description, estimatedMinutes } : { title, weightage };

export const tasksApi = {
  async listTasks() {
    const { today, timeZone, Tasks = [] } = await http.get("/tasks");
    return { today, timeZone, tasks: Tasks.map(toTask) };
  },

  async createTask(goalId, payload) {
    const { task, goalProgress } = await http.post(`/goals/${goalId}/tasks`, taskPayload(payload));
    return { task: toTask(task), goalProgress };
  },

  async updateTask(goalId, taskId, patch, { isRoadmap = false } = {}) {
    const body = isRoadmap
      ? { title: patch.title, description: patch.description, estimatedMinutes: patch.estimatedMinutes }
      : { title: patch.title, weightage: patch.weightage };
    const { task, goalProgress } = await http.patch(`/goals/${goalId}/tasks/${taskId}`, body);
    return { task: toTask(task), goalProgress };
  },

  deleteTask: (goalId, taskId) => http.delete(`/goals/${goalId}/tasks/${taskId}`),

  async createTodo({ title, dueDate, priority = null }) {
    const { task } = await http.post("/tasks", { title, dueDate, ...(priority ? { priority } : {}) });
    return toTask(task);
  },

  async updateTodo(taskId, patch) {
    const { task } = await http.patch(`/tasks/${taskId}`, patch);
    return toTask(task);
  },

  deleteTodo: (taskId) => http.delete(`/tasks/${taskId}`),

  completeToday: (goalId, taskId) => http.post(`/goals/${goalId}/tasks/${taskId}/complete`),

  reopen: (goalId, taskId) => http.post(`/goals/${goalId}/tasks/${taskId}/reopen`),

  undoComplete: (goalId, taskId, dateKey) =>
    http.delete(`/goals/${goalId}/tasks/${taskId}/completions/${dateKey}`),
};
