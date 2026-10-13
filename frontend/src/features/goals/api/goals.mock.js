// Mock adapter with the same interface as goals.api.js. Lets the UI run
// before the backend exists. Data persists in localStorage.

import { addDays, toDateInputValue } from "../../../lib/date.js";
import { readStorage, writeStorage } from "../../../lib/storage.js";

const STORAGE_KEY = "goalTracker.mock.goals.v1";
const LATENCY_MS = 300;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const MOCK_LIFE_AREAS = [
  { id: "la-work", name: "Work & Career", emoji: "💼", colorHex: "#4f46e5" },
  { id: "la-health", name: "Sport & Health", emoji: "🏃", colorHex: "#ea580c" },
  { id: "la-growth", name: "Personal development", emoji: "📚", colorHex: "#16a34a" },
  { id: "la-finance", name: "Finances", emoji: "💰", colorHex: "#d97706" },
  { id: "la-fun", name: "Fun & Relaxation", emoji: "🎨", colorHex: "#db2777" },
];

function seedGoals() {
  const today = new Date();
  const year = today.getFullYear();
  const d = (days) => toDateInputValue(addDays(today, days));
  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;

  const goal = (overrides) => ({
    description: "",
    parentGoalId: null,
    color: null,
    isFavorite: false,
    tasksCount: 0,
    completedAt: null,
    history: [],
    ...overrides,
  });

  return [
    goal({
      id: "g-1", title: "Do 100K revenue", lifeAreaId: "la-work", impact: "high",
      startDate: jan1, deadline: dec31, isFavorite: true,
      metric: { type: "money", current: 70000, target: 100000, unit: "$", prefix: true },
      history: [0, 8000, 15000, 24000, 33000, 41000, 50000, 58000, 64000, 70000],
    }),
    goal({
      id: "g-1a", title: "Sign 10 new clients", parentGoalId: "g-1", lifeAreaId: "la-work", impact: "high",
      startDate: `${year}-02-01`, deadline: dec31,
      metric: { type: "numeric", current: 6, target: 10, unit: "clients" }, history: [0, 1, 2, 2, 4, 5, 6],
    }),
    goal({
      id: "g-1b", title: "Grow newsletter to 50k subs", parentGoalId: "g-1", lifeAreaId: "la-work", impact: "medium",
      startDate: jan1, deadline: dec31, tasksCount: 6, isFavorite: true,
      metric: { type: "numeric", current: 42500, target: 50000, unit: "subs" },
      history: [12000, 18000, 24000, 29000, 33000, 38000, 42500],
    }),
    goal({
      id: "g-2", title: "Launch new website", lifeAreaId: "la-work", impact: "high",
      startDate: d(-7), deadline: d(45), tasksCount: 6,
      metric: { type: "tasks", current: 4, target: 6, unit: "tasks" },
    }),
    goal({
      id: "g-3", title: "Complete a Full Ironman", lifeAreaId: "la-health", impact: "high",
      startDate: `${year}-06-02`, deadline: d(90), tasksCount: 5,
      metric: { type: "percentage", current: 55, target: 100, unit: "%" }, history: [0, 10, 20, 32, 41, 55],
    }),
    goal({
      id: "g-3a", title: "Improve Swim Speed", parentGoalId: "g-3", lifeAreaId: "la-health", impact: "medium",
      startDate: `${year}-06-02`, deadline: d(-30),
      metric: { type: "distance", current: 2, target: 3, unit: "km" }, history: [0.5, 1, 1.4, 2],
    }),
    goal({
      id: "g-3b", title: "Increase Running Endurance", parentGoalId: "g-3", lifeAreaId: "la-health", impact: "high",
      startDate: `${year}-07-01`, deadline: d(6), tasksCount: 3,
      metric: { type: "distance", current: 15, target: 21, unit: "km" }, history: [5, 8, 10, 12, 15],
    }),
    goal({
      id: "g-3c", title: "Boost Bike Power & Endurance", parentGoalId: "g-3", lifeAreaId: "la-health", impact: "low",
      startDate: `${year}-08-01`, deadline: d(60),
      metric: { type: "numeric", current: 40, target: 60, unit: "km" }, history: [20, 25, 30, 40],
    }),
    goal({
      id: "g-4", title: "Write my first book", lifeAreaId: "la-growth", impact: "medium",
      startDate: jan1, deadline: d(60), tasksCount: 8, isFavorite: true, color: "green",
      metric: { type: "pages", current: 120, target: 300, unit: "pages" }, history: [0, 15, 40, 60, 85, 100, 120],
    }),
    goal({
      id: "g-4a", title: "Outline the book", parentGoalId: "g-4", lifeAreaId: "la-growth", impact: "medium",
      startDate: jan1, deadline: d(-40), tasksCount: 5, completedAt: d(-45),
      metric: { type: "tasks", current: 5, target: 5, unit: "tasks" },
    }),
    goal({
      id: "g-4b", title: "Write first draft", parentGoalId: "g-4", lifeAreaId: "la-growth", impact: "high",
      startDate: `${year}-03-01`, deadline: d(30),
      metric: { type: "chapters", current: 6, target: 12, unit: "chapters" }, history: [0, 1, 3, 4, 6],
    }),
    goal({
      id: "g-4c", title: "Revise first draft", parentGoalId: "g-4", lifeAreaId: "la-growth", impact: "medium",
      startDate: d(31), deadline: d(60),
      metric: { type: "chapters", current: 0, target: 12, unit: "chapters" },
    }),
    goal({
      id: "g-5", title: "Read 12 books", lifeAreaId: "la-growth", impact: "low",
      startDate: jan1, deadline: dec31,
      metric: { type: "numeric", current: 8, target: 12, unit: "books" }, history: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    }),
    goal({
      id: "g-6", title: "Learn Basic Spanish for Travel", lifeAreaId: "la-growth", impact: "low",
      startDate: `${year - 1}-07-01`, deadline: d(-240),
      metric: { type: "time", current: 0, target: 100, unit: "h" },
    }),
    goal({
      id: "g-7", title: "Save $10,000 emergency fund", lifeAreaId: "la-finance", impact: "high",
      startDate: jan1, deadline: d(150),
      metric: { type: "money", current: 6200, target: 10000, unit: "$", prefix: true },
      history: [500, 1200, 2100, 3000, 3800, 4700, 5500, 6200],
    }),
    goal({
      id: "g-8", title: "Plan a trip to Japan", lifeAreaId: "la-fun", impact: "medium",
      startDate: d(-20), deadline: d(240), tasksCount: 9,
      metric: { type: "tasks", current: 2, target: 9, unit: "tasks" },
    }),
    goal({
      id: "g-9", title: "Learn to play 5 songs on guitar", lifeAreaId: "la-fun", impact: "low",
      startDate: `${year}-02-01`, deadline: d(-10), completedAt: d(-20),
      metric: { type: "numeric", current: 5, target: 5, unit: "songs" }, history: [0, 1, 2, 3, 4, 5],
    }),
  ];
}

function loadGoals() {
  const stored = readStorage(STORAGE_KEY);
  if (Array.isArray(stored) && stored.length) return stored;
  const seeded = seedGoals();
  writeStorage(STORAGE_KEY, seeded);
  return seeded;
}

let goals = loadGoals();

function persist() {
  writeStorage(STORAGE_KEY, goals);
}

const clone = (value) => JSON.parse(JSON.stringify(value));

export const mockGoalsApi = {
  async listGoals() {
    await wait(LATENCY_MS);
    return { goals: clone(goals) };
  },

  async createGoal(payload) {
    await wait(LATENCY_MS);
    const goal = {
      id: `g-${Date.now()}`,
      description: "",
      parentGoalId: null,
      color: null,
      isFavorite: false,
      tasksCount: 0,
      completedAt: null,
      history: [],
      ...payload,
    };
    if (goal.metric && typeof goal.metric.current === "number") goal.history = [goal.metric.current];
    goals = [...goals, goal];
    persist();
    return { goal: clone(goal) };
  },

  async updateGoal(id, patch) {
    await wait(LATENCY_MS);
    const index = goals.findIndex((g) => g.id === id);
    if (index === -1) throw new Error("Goal not found");

    const current = goals[index];
    const next = { ...current, ...patch };

    if (patch.metric && patch.metric.current !== current.metric?.current) {
      next.history = [...(current.history ?? []), patch.metric.current];
    }

    goals = goals.map((g) => (g.id === id ? next : g));
    persist();
    return { goal: clone(next) };
  },

  async deleteGoal(id) {
    await wait(LATENCY_MS);
    goals = goals.filter((g) => g.id !== id && g.parentGoalId !== id);
    persist();
    return { message: "Goal deleted" };
  },

  async listLifeAreas() {
    await wait(LATENCY_MS / 2);
    return { lifeAreas: clone(MOCK_LIFE_AREAS) };
  },

  /** Test helper: wipe persisted data and reseed. */
  reset() {
    goals = seedGoals();
    persist();
  },
};
