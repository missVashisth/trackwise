// API layer for challenges.
//
//   GET    /api/challenges?category=                                   -> { challenges }   catalogue (+ the user's private ones)
//   POST   /api/challenges/templates                                   -> { challenge }    create a private template
//   GET    /api/challenges/templates/:id                               -> { challenge }    details, participants, my attempts
//   PATCH  /api/challenges/templates/:id                               -> { challenge }    owner edits (new version)
//   POST   /api/challenges/templates/:id/archive                       -> { challenge }
//   POST   /api/challenges/templates/:id/join                          -> { enrollment }   { startDate?, reminders?, acknowledgedStrictRule? }
//   GET    /api/challenges/mine                                        -> { today, enrollments }
//   GET    /api/challenges/enrollments/:id                             -> { enrollment }   with report + recentActivity
//   PATCH  /api/challenges/enrollments/:id                             -> { enrollment }   { activities?: [{ key, target?, enabled? }], reminders? }
//   POST   /api/challenges/enrollments/:id/leave | restart             -> { enrollment }
//   GET    /api/challenges/enrollments/:id/days/:date                  -> { day }
//   PUT    /api/challenges/enrollments/:id/days/:date/activities/:key  -> { log, day }   { done } | { value }
//   DELETE /api/challenges/enrollments/:id/days/:date/activities/:key  -> { day }

import { http } from "../../../lib/http.js";

const enc = encodeURIComponent;

export const challengesApi = {
  list: async (category) => (await http.get(`/challenges${category ? `?category=${enc(category)}` : ""}`)).challenges,
  getTemplate: async (id) => (await http.get(`/challenges/templates/${enc(id)}`)).challenge,
  createTemplate: async (body) => (await http.post("/challenges/templates", body)).challenge,
  archiveTemplate: async (id) => (await http.post(`/challenges/templates/${enc(id)}/archive`)).challenge,
  join: async (id, body) => (await http.post(`/challenges/templates/${enc(id)}/join`, body)).enrollment,
  mine: () => http.get("/challenges/mine"),
  getEnrollment: async (id) => (await http.get(`/challenges/enrollments/${enc(id)}`)).enrollment,
  updateSettings: async (id, body) => (await http.patch(`/challenges/enrollments/${enc(id)}`, body)).enrollment,
  leave: async (id) => (await http.post(`/challenges/enrollments/${enc(id)}/leave`)).enrollment,
  restart: async (id) => (await http.post(`/challenges/enrollments/${enc(id)}/restart`, {})).enrollment,
  getDay: async (id, date) => (await http.get(`/challenges/enrollments/${enc(id)}/days/${enc(date)}`)).day,
  log: (id, date, key, body) => http.put(`/challenges/enrollments/${enc(id)}/days/${enc(date)}/activities/${enc(key)}`, body),
  clear: async (id, date, key) => (await http.delete(`/challenges/enrollments/${enc(id)}/days/${enc(date)}/activities/${enc(key)}`)).day,
};
