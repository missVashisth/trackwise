import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { AuthProvider } from "./features/auth/services/auth.context.jsx";
import ProtectedRoute from "./features/auth/components/ProtectedRoute.jsx";
import PublicRoute from "./features/auth/components/PublicRoute.jsx";

import Login from "./features/auth/pages/Login.jsx";
import Register from "./features/auth/pages/Register.jsx";
import ForgotPassword from "./features/auth/pages/ForgotPassword.jsx";
import ResetPassword from "./features/auth/pages/ResetPassword.jsx";
import GoalsPage from "./features/goals/pages/GoalsPage.jsx";
import UpcomingPage from "./features/tasks/pages/UpcomingPage.jsx";
import ChallengesPage from "./features/challenges/pages/ChallengesPage.jsx";
import ChallengeTemplatePage from "./features/challenges/pages/ChallengeTemplatePage.jsx";
import ChallengeNewPage from "./features/challenges/pages/ChallengeNewPage.jsx";
import EnrollmentPage from "./features/challenges/pages/EnrollmentPage.jsx";
import TodayPage from "./features/tasks/pages/TodayPage.jsx";
import CompletedGoalsPage from "./features/goals/pages/CompletedGoalsPage.jsx";
import GoalDashboardPage from "./features/goals/pages/GoalDashboardPage.jsx";
import HabitsPage from "./features/habits/pages/HabitsPage.jsx";
import HabitFormPage from "./features/habits/pages/HabitFormPage.jsx";
import HabitDetailPage from "./features/habits/pages/HabitDetailPage.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import PlaceholderPage from "./pages/PlaceholderPage.jsx";
import { PLACEHOLDER_ROUTES, RETIRED_ROUTES } from "./app.navigation.js";
import { insightsRoute } from "./features/insights/insights.routes.js";

function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // Public routes
      {
        element: <PublicRoute />,
        children: [
          { path: "/login", element: <Login /> },
          { path: "/register", element: <Register /> },
          { path: "/forgot-password", element: <ForgotPassword /> },
        ],
      },

      // Reachable signed in or not: the emailed link must work in whatever browser opens it.
      { path: "/reset-password", element: <ResetPassword /> },

      // Protected routes
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: "/", element: <Navigate to="/goals" replace /> },
              { path: "/goals", element: <GoalsPage /> },
              { path: "/goals/:goalId", element: <GoalDashboardPage /> },
              { path: "/habits", element: <HabitsPage /> },
              { path: "/habits/new", element: <HabitFormPage /> },
              { path: "/habits/:habitId", element: <HabitDetailPage /> },
              { path: "/habits/:habitId/edit", element: <HabitFormPage /> },
              { path: "/challenges", element: <ChallengesPage /> },
              { path: "/challenges/new", element: <ChallengeNewPage /> },
              { path: "/challenges/t/:templateId", element: <ChallengeTemplatePage /> },
              { path: "/challenges/my/:enrollmentId", element: <EnrollmentPage /> },
              insightsRoute,
              { path: "/upcoming", element: <UpcomingPage /> },
              // "All Tasks" was folded into Upcoming; keep old links working.
              { path: "/tasks", element: <Navigate to="/upcoming" replace /> },
              ...RETIRED_ROUTES.map(({ from, to }) => ({ path: from, element: <Navigate to={to} replace /> })),
              { path: "/today", element: <TodayPage /> },
              { path: "/completed", element: <CompletedGoalsPage /> },
              ...PLACEHOLDER_ROUTES.map((item) => ({
                path: item.to,
                element: (
                  <PlaceholderPage title={item.label} icon={item.icon} />
                ),
              })),
            ],
          },
        ],
      },

      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
