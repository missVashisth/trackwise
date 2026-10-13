// The goal's plan: its roadmap (one-time tasks scheduled day by day, usually generated with AI),
// the timeline toward the deadline, the daily routine (recurring tasks) and any subgoals.

import { Link } from "react-router";
import { CalendarRange, Pencil, Plus, Repeat, Sparkles, Trash2 } from "lucide-react";
import { Button, EmptyState, IconButton, Skeleton } from "../../../../components/ui/index.js";
import { cn } from "../../../../lib/cn.js";
import { formatLongDate, formatShortDate } from "../../../../lib/date.js";
import { getProgress } from "../../goals.selectors.js";
import { Card, ProgressBar, StatusBadge } from "./dashboardParts.jsx";
import { goalStatusOf, plural, tickBlockedReason } from "./dashboard.utils.js";
import { ROADMAP_STATUS, formatMinutes, roadmapDays } from "../../../roadmap/roadmap.selectors.js";

function Timeline({ goal, status, insights, colorHex }) {
  if (!insights) return <Skeleton className="h-24 w-full rounded-lg" />;
  const { timeline } = insights;
  const timePercent = (timeline.elapsedDays / timeline.totalDays) * 100;
  const overall = getProgress(goal);

  const caption =
    status === "upcoming"
      ? `Starts in ${plural(timeline.daysUntilStart, "day")}`
      : status === "completed"
        ? `Completed on ${formatLongDate(timeline.completedOn)}, after ${plural(timeline.elapsedDays, "day")}`
        : status === "ended"
          ? `The ${plural(timeline.totalDays, "day")} ended on ${formatLongDate(timeline.deadline)}`
          : `Day ${timeline.elapsedDays} of ${timeline.totalDays} · ${
              timeline.remainingDays <= 1 ? "last day today" : `${plural(timeline.remainingDays - 1, "day")} left after today`
            }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 text-xs">
        <div>
          <p className="font-medium text-slate-500">Start</p>
          <p className="text-sm font-semibold text-slate-900">{formatLongDate(timeline.startDate)}</p>
        </div>
        <p className="hidden pt-3 text-center text-slate-500 sm:block">{caption}</p>
        <div className="text-right">
          <p className="font-medium text-slate-500">Deadline</p>
          <p className="text-sm font-semibold text-slate-900">{timeline.deadline ? formatLongDate(timeline.deadline) : "None"}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 sm:hidden">{caption}</p>

      <div className="grid gap-3">
        <div className="grid grid-cols-[88px_minmax(0,1fr)_44px] items-center gap-3 text-xs">
          <span className="text-slate-500">Time used</span>
          <ProgressBar value={timePercent} colorHex="#94a3b8" label="Share of the goal’s days used" />
          <span className="text-right font-medium tabular-nums text-slate-700">{Math.round(timePercent)}%</span>
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)_44px] items-center gap-3 text-xs">
          <span className="text-slate-500">Progress</span>
          <ProgressBar value={overall} colorHex={colorHex} label="Overall goal progress" />
          <span className="text-right font-medium tabular-nums text-slate-700">{overall}%</span>
        </div>
      </div>
    </div>
  );
}

function RoadmapStatusPill({ status, count }) {
  const meta = ROADMAP_STATUS[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", meta.className)}>
      {count != null ? `${count} ${meta.label.toLowerCase()}` : meta.label}
    </span>
  );
}

/** One roadmap task inside a day: tick, title, description, estimate and actions. */
function RoadmapTaskItem({ task, canTick, tickHint, pending, onToggle, onEdit, onDelete }) {
  const done = Boolean(task.completedAt);
  return (
    <li className="group flex items-start gap-3 py-2.5">
      <input
        type="checkbox"
        checked={done}
        disabled={!canTick || pending}
        aria-busy={pending || undefined}
        onChange={() => onToggle(task)}
        title={canTick ? undefined : tickHint}
        aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-sm font-medium text-slate-900", done && "text-slate-400 line-through")}>{task.title}</span>
          {task.roadmapStatus === "pending" && <RoadmapStatusPill status="pending" />}
        </div>
        {task.description && <p className="mt-0.5 text-xs text-slate-500">{task.description}</p>}
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-400">
          {task.estimatedMinutes ? <span>{formatMinutes(task.estimatedMinutes)}</span> : null}
          {done && <span className="text-green-700">Done {formatShortDate(task.completedAt)}</span>}
          {task.source === "manual" && <span>Added manually</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <IconButton icon={Pencil} size="sm" label="Edit task" onClick={() => onEdit(task)} />
        <IconButton icon={Trash2} size="sm" label="Delete task" onClick={() => onDelete(task)} />
      </div>
    </li>
  );
}

function dayState(tasks) {
  const counts = { today: 0, pending: 0, upcoming: 0, completed: 0 };
  for (const task of tasks) counts[task.roadmapStatus] = (counts[task.roadmapStatus] ?? 0) + 1;
  return counts;
}

/** Day-by-day roadmap. Today's day and days with overdue tasks start expanded. */
function RoadmapTimeline({ roadmapTasks, today, colorHex, canTick, tickHint, pendingIds, onToggle, onEdit, onDelete }) {
  const days = roadmapDays(roadmapTasks);
  return (
    <ol className="relative flex flex-col gap-2">
      {days.map((day) => {
        const counts = dayState(day.tasks);
        const isToday = day.date === today;
        const allDone = counts.completed === day.tasks.length;
        return (
          <li key={day.date}>
            <details open={isToday || counts.pending > 0} className={cn("group rounded-xl border bg-white", isToday ? "border-brand-300 ring-1 ring-brand-200" : "border-slate-200")}>
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span
                  className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", allDone ? "text-white" : "bg-slate-100 text-slate-600")}
                  style={allDone ? { backgroundColor: colorHex } : undefined}
                  aria-hidden="true"
                >
                  {day.day ?? "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">
                    Day {day.day} {isToday && <span className="font-medium text-brand-700">· Today</span>}
                  </span>
                  <span className="block text-xs text-slate-500">{formatLongDate(day.date)} · {counts.completed} of {day.tasks.length} done</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {allDone ? (
                    <RoadmapStatusPill status="completed" />
                  ) : counts.pending > 0 ? (
                    <RoadmapStatusPill status="pending" count={counts.pending} />
                  ) : isToday ? (
                    <RoadmapStatusPill status="today" />
                  ) : (
                    <RoadmapStatusPill status="upcoming" />
                  )}
                  <span className="text-slate-400 transition group-open:rotate-90" aria-hidden="true">›</span>
                </span>
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100 px-4">
                {day.tasks.map((task) => (
                  <RoadmapTaskItem
                    key={task.id}
                    task={task}
                    canTick={canTick}
                    tickHint={tickHint}
                    pending={pendingIds.has(task.id)}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

function RoadmapOverview({ goal, roadmapTasks, roadmapGroups, colorHex, onAddRoadmapTask, canAdd }) {
  const roadmap = goal.roadmap;
  const { total = roadmapTasks.length, completed = roadmapGroups.completed.length } = goal.progress?.roadmap ?? {};
  const percent = getProgress(goal);
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          Roadmap
          {roadmap?.source === "ai" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {roadmap.tailored ? "AI · tailored" : "AI"}
            </span>
          )}
        </span>
      }
      description={`${goal.totalDays} days · ${formatShortDate(goal.startDate)} – ${formatShortDate(goal.deadline)}`}
      action={canAdd && <Button variant="secondary" size="sm" icon={Plus} onClick={onAddRoadmapTask}>Add task</Button>}
    >
      {roadmap?.summary && <p className="mb-3 text-sm text-slate-600">{roadmap.summary}</p>}
      <div className="flex items-center gap-3">
        <ProgressBar value={percent} colorHex={percent >= 100 ? "#16a34a" : colorHex} label="Roadmap progress" />
        <span className="shrink-0 text-sm font-semibold text-slate-900">{completed}/{total} · {percent}%</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <RoadmapStatusPill status="today" count={roadmapGroups.today.length} />
        <RoadmapStatusPill status="pending" count={roadmapGroups.pending.length} />
        <RoadmapStatusPill status="upcoming" count={roadmapGroups.upcoming.length} />
        <RoadmapStatusPill status="completed" count={roadmapGroups.completed.length} />
      </div>
      {roadmap?.phases?.length > 0 && (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roadmap.phases.map((phase, index) => (
            <li key={`${phase.startDay}-${phase.title}`} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Phase {index + 1} · days {phase.startDay}–{phase.endDay}</p>
              <p className="text-sm font-medium text-slate-800">{phase.title}</p>
              {phase.description && <p className="mt-0.5 text-xs text-slate-500">{phase.description}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function GoalRoadmapTab({ goal, status, colorHex, tasks, roadmapTasks, roadmapGroups, today, insights, subgoals, pendingIds, onToggle, onEdit, onDelete, onAddTask, onAddRoadmapTask, onPlanWithAi }) {
  const totalWeight = tasks.reduce((sum, t) => sum + (t.weightage ?? 0), 0);
  const orderedSubgoals = [...subgoals].sort((a, b) => String(a.startDate ?? "").localeCompare(String(b.startDate ?? "")));
  const open = status !== "completed";
  const hasRoadmap = roadmapTasks.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {hasRoadmap ? (
        <>
          <RoadmapOverview goal={goal} roadmapTasks={roadmapTasks} roadmapGroups={roadmapGroups} colorHex={colorHex} onAddRoadmapTask={onAddRoadmapTask} canAdd={open} />
          <RoadmapTimeline
            roadmapTasks={roadmapTasks}
            today={today}
            colorHex={colorHex}
            canTick={open}
            tickHint={tickBlockedReason(status) ?? undefined}
            pendingIds={pendingIds}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </>
      ) : (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="No roadmap yet"
            description={
              open
                ? "Generate a day-by-day plan with AI, tailor it to your time and level, and review it before anything is saved. You can also schedule tasks yourself."
                : "This goal is completed. Reopen it to plan a roadmap."
            }
            action={
              open && (
                <div className="flex flex-wrap justify-center gap-2">
                  {onPlanWithAi && <Button icon={Sparkles} onClick={onPlanWithAi}>Plan with AI</Button>}
                  <Button variant="secondary" icon={Plus} onClick={onAddRoadmapTask}>Schedule a task</Button>
                </div>
              )
            }
          />
        </Card>
      )}

      <Card title="Timeline" description="From the start date to the deadline">
        <Timeline goal={goal} status={status} insights={insights} colorHex={colorHex} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Daily routine"
          description="Recurring tasks: they repeat every day while the goal runs."
          action={open && <Button variant="secondary" size="sm" icon={Plus} onClick={onAddTask}>Add daily task</Button>}
        >
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No daily tasks. Add habits you want to repeat every day.</p>
          ) : (
            <ol className="relative flex flex-col gap-3 border-l border-slate-200 pl-5">
              {tasks.map((task) => (
                <li key={task.id} className="relative">
                  <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-white" style={{ backgroundColor: colorHex }} aria-hidden="true" />
                  <p className="text-sm font-medium text-slate-800">{task.title}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500">
                    <Repeat className="h-3 w-3" aria-hidden="true" />
                    Every day · weightage {task.weightage}
                    {totalWeight > 0 && ` (${Math.round((task.weightage / totalWeight) * 100)}% of the day)`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {orderedSubgoals.length > 0 && (
          <Card title="Subgoals" description="Goals filed under this one">
            <ul className="flex flex-col divide-y divide-slate-100">
              {orderedSubgoals.map((sub) => (
                <li key={sub.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/goals/${sub.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 hover:text-brand-700">{sub.title}</Link>
                    <StatusBadge status={goalStatusOf(sub)} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <CalendarRange className="h-3 w-3" aria-hidden="true" />
                      {formatShortDate(sub.startDate)} – {sub.deadline ? formatShortDate(sub.deadline) : "no deadline"}
                    </span>
                    <ProgressBar value={getProgress(sub)} colorHex={colorHex} label={`${sub.title} progress`} className="h-1.5" />
                    <span className="w-9 shrink-0 text-right tabular-nums">{getProgress(sub)}%</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

export default GoalRoadmapTab;
