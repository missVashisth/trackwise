// Sidebar structure. Mirrors Griply's groups; add an entry here and a route
// in app.routes.jsx to grow the app.
import { BarChart3, Calendar, CalendarDays, Check, FolderKanban, Repeat, Target, Trophy } from "lucide-react";

export const NAV_SECTIONS = [
  {
    id: "todo",
    title: "To Do",
    items: [
      { to: "/today", label: "Today", icon: Calendar },
      { to: "/completed", label: "Completed", icon: Check },
    ],
  },
  {
    id: "plan",
    title: "Plan",
    items: [
      { to: "/upcoming", label: "Upcoming", icon: CalendarDays },
    ],
  },
  {
    id: "big-picture",
    title: "Big Picture",
    items: [
      { to: "/goals", label: "Goals", icon: Target },
      // { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/habits", label: "Habits", icon: Repeat },
      { to: "/challenges", label: "Challenges", icon: Trophy },
      { to: "/insights", label: "Insights", icon: BarChart3 },
    ],
  },
];

/**
 * Removed sections and where their old addresses now lead (each to its closest real page):
 * Inbox (quick to-dos) -> Today, Timeline (date-based planning) -> Upcoming, Life Areas (a property
 * of goals, still set on each goal) -> Goals.
 */
export const RETIRED_ROUTES = [
  { from: "/inbox", to: "/today" },
  { from: "/timeline", to: "/upcoming" },
  { from: "/life-areas", to: "/goals" },
];

/** Routes that render a placeholder until their feature is built. */
export const PLACEHOLDER_ROUTES = NAV_SECTIONS.flatMap((s) => s.items).filter((item) => !["/goals", "/today", "/upcoming", "/completed", "/habits", "/challenges", "/insights"].includes(item.to));
