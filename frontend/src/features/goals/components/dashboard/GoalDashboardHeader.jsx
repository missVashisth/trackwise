import { Link } from "react-router";
import { CalendarCheck, CalendarDays, ChevronLeft, CheckCircle2, Menu, MoreHorizontal, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import { Button, IconButton, MenuDivider, MenuItem, Popover } from "../../../../components/ui/index.js";
import { formatLongDate } from "../../../../lib/date.js";
import { getProgress } from "../../goals.selectors.js";
import DeadlineBadge from "../DeadlineBadge.jsx";
import GoalIcon from "../GoalIcon.jsx";
import ImpactBolts from "../ImpactBolts.jsx";
import LifeAreaAvatar from "../LifeAreaAvatar.jsx";
import { ProgressBar, StatusBadge } from "./dashboardParts.jsx";
import { GOAL_TABS } from "./dashboard.utils.js";

function GoalDashboardHeader({ goal, status, parent, lifeArea, colorHex, onOpenSidebar, onEdit, onToggleComplete, onToggleFavorite, onDelete, completing }) {
  const progress = getProgress(goal);
  const completed = status === "completed";

  return (
    <div className="border-b border-slate-100 px-4 pt-3 sm:px-5">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
        <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="-ml-1.5 lg:hidden" />
        <Link to="/goals" className="inline-flex items-center gap-0.5 rounded font-medium hover:text-slate-800">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Goals
        </Link>
        {parent && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/goals/${parent.id}`} className="truncate hover:text-slate-800">{parent.title}</Link>
          </>
        )}
      </nav>

      <div className="mt-2 flex flex-col gap-4 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5">
            <GoalIcon colorHex={colorHex} completed={completed} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-slate-900">{goal.title}</h1>
              <StatusBadge status={status} />
              {goal.isFavorite && <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-label="Favorite" />}
            </div>
            {goal.description && <p className="mt-1 max-w-2xl whitespace-pre-line text-sm text-slate-600">{goal.description}</p>}

            <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <div className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                <dt className="sr-only">Start date</dt>
                <dd>Starts {formatLongDate(goal.startDate)}</dd>
              </div>
              {goal.deadline && (
                <div className="inline-flex items-center gap-1">
                  <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <dt className="sr-only">Deadline</dt>
                  <dd className="inline-flex items-center gap-1.5">
                    Ends {formatLongDate(goal.deadline)}
                    {!completed && <DeadlineBadge deadline={goal.deadline} />}
                  </dd>
                </div>
              )}
              {completed && goal.completedAt && (
                <div className="inline-flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <dt className="sr-only">Completed</dt>
                  <dd>Completed {formatLongDate(goal.completedAt)}</dd>
                </div>
              )}
              <div className="inline-flex items-center gap-1">
                <dt className="sr-only">Impact</dt>
                <dd><ImpactBolts impact={goal.impact} /></dd>
              </div>
              {lifeArea && (
                <div className="inline-flex items-center gap-1">
                  <dt className="sr-only">Life area</dt>
                  <dd className="inline-flex items-center gap-1">
                    <LifeAreaAvatar lifeArea={lifeArea} size="sm" />
                    {lifeArea.name}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>
          <Button
            variant={completed ? "secondary" : "primary"}
            size="sm"
            icon={completed ? RotateCcw : CheckCircle2}
            onClick={onToggleComplete}
            loading={completing}
          >
            {completed ? "Reopen" : "Mark complete"}
          </Button>
          <Popover
            width="w-48"
            trigger={({ active, ...props }) => <IconButton icon={MoreHorizontal} label="More goal actions" active={active} {...props} />}
          >
            <MenuItem icon={Star} onSelect={onToggleFavorite}>{goal.isFavorite ? "Remove from favorites" : "Add to favorites"}</MenuItem>
            <MenuDivider />
            <MenuItem icon={Trash2} tone="danger" onSelect={onDelete}>Delete goal</MenuItem>
          </Popover>
        </div>
      </div>

      <div className="flex items-center gap-3 pb-4">
        <ProgressBar value={progress} colorHex={progress >= 100 ? "#16a34a" : colorHex} label="Overall goal progress" />
        <span className="shrink-0 text-right text-sm font-semibold text-slate-900">
          {progress}% <span className="font-normal text-slate-500">overall</span>
          {goal.progress?.basis === "roadmap" && (
            <span className="block text-xs font-normal text-slate-500">
              {goal.progress.roadmap.completed} of {goal.progress.roadmap.total} roadmap tasks
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function GoalTabs({ active, onChange, counts = {} }) {
  function handleKeyDown(event) {
    const index = GOAL_TABS.findIndex((t) => t.id === active);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = GOAL_TABS[(index + step + GOAL_TABS.length) % GOAL_TABS.length];
    onChange(next.id);
    document.getElementById(`goal-tab-${next.id}`)?.focus();
  }

  return (
    <div role="tablist" aria-label="Goal sections" onKeyDown={handleKeyDown} className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 sm:px-4">
      {GOAL_TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`goal-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="goal-tabpanel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={
              selected
                ? "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-brand-600 px-2.5 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus-visible:bg-slate-50"
                : "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:bg-slate-50"
            }
          >
            {tab.label}
            {counts[tab.id] != null && (
              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-600">{counts[tab.id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default GoalDashboardHeader;
