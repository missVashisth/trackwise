// Frame for every Insights page: title, section tabs and ONE period selector. The overview report
// for the selected period is loaded here once and shared with the Overview, Goals, Habits and
// My Patterns pages; goal and habit detail pages load their own report for the same period.

import { NavLink, Outlet, useOutletContext } from "react-router";
import { Menu } from "lucide-react";
import { Alert, Button, IconButton, Skeleton } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { insightsApi } from "../api/insights.api.js";
import { useInsightsReport } from "../hooks/useInsightsReport.js";
import { usePeriodParam } from "../hooks/usePeriodParam.js";
import { periodQueryString } from "../insights.format.js";
import PeriodSelector from "./PeriodSelector.jsx";

const TABS = [
  { to: "/insights", label: "Overview", end: true },
  { to: "/insights/goals", label: "Goals" },
  { to: "/insights/habits", label: "Habits" },
  { to: "/insights/patterns", label: "My Patterns" },
  { to: "/insights/challenges", label: "Challenges" },
];

function InsightsShell() {
  const parent = useOutletContext() ?? {};
  const [period, setPeriod] = usePeriodParam();
  const qs = periodQueryString(period);
  const overview = useInsightsReport(() => insightsApi.overview(period), qs);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 px-4 pt-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <IconButton icon={Menu} label="Open navigation" onClick={parent.onOpenSidebar} className="lg:hidden" />
            <h1 className="text-lg font-semibold text-slate-900">Insights</h1>
          </div>
          <PeriodSelector key={period.period} state={period} range={overview.data?.range} onChange={setPeriod} disabled={overview.loading && !overview.data} />
        </div>
        <nav aria-label="Insights sections" className="-mb-px mt-2 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={`${tab.to}?${qs}`}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:bg-slate-50",
                  isActive ? "border-brand-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
          <Outlet context={{ ...parent, overview, period, qs }} />
        </div>
      </div>
    </div>
  );
}

/** Loading / error states for a report, then the page content. */
export function ReportGate({ report, children, notFoundText = "Not found." }) {
  if (report.notFound) return <Alert>{notFoundText}</Alert>;
  if (!report.data) {
    return report.error ? (
      <Alert>
        Couldn’t load insights. {report.error}{" "}
        <Button variant="ghost" size="sm" onClick={report.reload} className="ml-1 underline">Retry</Button>
      </Alert>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading insights">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        <Skeleton className="h-72 rounded-2xl sm:col-span-2 lg:col-span-4" />
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-5 transition-opacity", report.loading && "opacity-60")} aria-busy={report.loading}>
      {report.error && <Alert>Couldn’t refresh. {report.error}</Alert>}
      {children(report.data)}
    </div>
  );
}

export default InsightsShell;
