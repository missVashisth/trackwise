// Route tree for /insights. Every page is loaded on demand (and the chart library with it), using
// React Router's lazy routes.
const load = (importer) => async () => ({ Component: (await importer()).default });

export const insightsRoute = {
  path: "/insights",
  lazy: load(() => import("./components/InsightsShell.jsx")),
  children: [
    { index: true, lazy: load(() => import("./pages/OverviewPage.jsx")) },
    { path: "goals", lazy: load(() => import("./pages/GoalsListPage.jsx")) },
    { path: "goals/:goalId", lazy: load(() => import("./pages/GoalDetailPage.jsx")) },
    { path: "habits", lazy: load(() => import("./pages/HabitsListPage.jsx")) },
    { path: "habits/:habitId", lazy: load(() => import("./pages/HabitDetailPage.jsx")) },
    { path: "patterns", lazy: load(() => import("./pages/PatternsPage.jsx")) },
    { path: "challenges", lazy: load(() => import("./pages/ChallengesInsightsPage.jsx")) },
  ],
};
