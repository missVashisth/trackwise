// /upcoming — the tasks of ONE selected date (today by default). Previous/next day, a date picker
// and a Today shortcut move between dates; the date is in the URL (?date=YYYY-MM-DD) so refresh
// and links keep it. On today, open tasks from earlier days are shown in a small Overdue group.

import { useCallback, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Flag, Inbox, Menu, Plus, Repeat, Target } from "lucide-react";
import { Alert, Button, IconButton, Input, Skeleton } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { useGoals } from "../../goals/hooks/useGoals.js";
import { useTaskToggle, useTasks } from "../hooks/useTasks.js";
import TaskFormModal from "../components/TaskFormModal.jsx";
import QuickAddTask from "../components/QuickAddTask.jsx";
import { buildDay, dayLabel, dayMonth, isDateKey, isDone, longDate, plannedDate, shiftKey } from "../upcoming.selectors.js";

const PRIORITY_STYLE = { high: "text-red-600", medium: "text-amber-500", low: "text-sky-500" };

/** Compact row: completion box, title, and one quiet line of essentials. */
function TaskRow({ task, goal, today, showDate, pending, onToggle, onEdit }) {
  const done = isDone(task);
  const canTick = !goal || !goal.completedAt;
  const date = plannedDate(task);
  return (
    <li className="flex items-start gap-3 px-1 py-2.5">
      <input
        type="checkbox"
        checked={done}
        disabled={!canTick || pending}
        aria-busy={pending || undefined}
        onChange={() => onToggle(task)}
        aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className={cn("block max-w-full truncate text-left text-sm text-slate-900 hover:text-brand-700", done && "text-slate-400 line-through")}
        >
          {task.title}
        </button>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-slate-400">
          {goal ? (
            <Link to={`/goals/${goal.id}?tab=roadmap`} className="inline-flex min-w-0 items-center gap-1 hover:text-brand-700">
              <Target className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{goal.title}</span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Inbox className="h-3 w-3" aria-hidden="true" />
              To-do
            </span>
          )}
          {showDate && date && <span className={cn(!done && date < today && "text-red-600")}>{dayMonth(date)}</span>}
          {task.priority && !done && (
            <span className={cn("inline-flex items-center gap-0.5", PRIORITY_STYLE[task.priority])}>
              <Flag className="h-3 w-3" aria-hidden="true" />
              {task.priority[0].toUpperCase() + task.priority.slice(1)}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

function Group({ title, count, tone, children }) {
  return (
    <section aria-label={title} className="mt-6">
      <h3 className={cn("mb-1 border-b border-slate-100 px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide", tone ?? "text-slate-500")}>
        {title} <span className="font-normal">· {count}</span>
      </h3>
      <ul className="divide-y divide-slate-50">{children}</ul>
    </section>
  );
}

function UpcomingPage() {
  const { onOpenSidebar } = useOutletContext() ?? {};
  const [params, setParams] = useSearchParams();
  const { goals, isLoading: goalsLoading } = useGoals();
  const { tasks, today, status, error, actionError, isLoading: tasksLoading, load, createTask, updateTask, clearActionError } = useTasks();
  const [handleToggle, pendingIds] = useTaskToggle();
  const [adding, setAdding] = useState(false);
  const [addedNote, setAddedNote] = useState(null);
  const [editing, setEditing] = useState(null);

  const requested = params.get("date");
  const date = today ? (isDateKey(requested) ? requested : today) : null;
  const goTo = useCallback(
    (key) => {
      if (!isDateKey(key)) return;
      setAdding(false);
      setAddedNote(null);
      setParams(key === today ? {} : { date: key }, { replace: true });
    },
    [setParams, today],
  );

  const goalById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const day = useMemo(() => (date ? buildDay({ tasks, goals, today, date }) : null), [tasks, goals, today, date]);

  const submitNew = useCallback(
    async (payload) => {
      try {
        await createTask(payload);
      } catch (err) {
        clearActionError(); // the form shows this failure itself
        throw err;
      }
      const savedFor = payload.dueDate ?? payload.scheduledDate;
      setAddedNote(savedFor && savedFor !== date ? `Task added for ${longDate(savedFor, today)}.` : null);
    },
    [createTask, clearActionError, date, today],
  );

  const submitEdit = useCallback(
    async ({ goalId: _goalId, ...fields }) => {
      await updateTask(editing, fields);
      setEditing(null);
    },
    [editing, updateTask],
  );

  const loading = goalsLoading || tasksLoading || !day;
  const row = (task, showDate = false) => (
    <TaskRow
      key={task.id}
      task={task}
      goal={task.goalId ? goalById.get(task.goalId) : null}
      today={today}
      showDate={showDate}
      pending={pendingIds?.has(task.id)}
      onToggle={handleToggle}
      onEdit={setEditing}
    />
  );
  const openCount = day ? day.scheduled.filter((t) => !isDone(t)).length : 0;
  const relative = date && ["Today", "Tomorrow", "Yesterday"].includes(dayLabel(date, today)) ? dayLabel(date, today) : null;
  const isEmpty = day && !day.scheduled.length && !day.overdue.length && !day.daily.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="lg:hidden" />
        <h1 className="text-lg font-semibold text-slate-900">Upcoming</h1>
      </div>

      {(actionError || status === "error") && (
        <div className="px-4 pt-3 sm:px-5">
          {actionError && <Alert onDismiss={clearActionError}>{actionError}</Alert>}
          {status === "error" && (
            <Alert>
              Couldn’t load tasks. {error}{" "}
              <Button variant="ghost" size="sm" onClick={load} className="ml-1 underline">Retry</Button>
            </Alert>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-5 sm:px-6">
          {loading ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading tasks">
              <Skeleton className="h-9 w-64" />
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-5 w-2/3" />)}
            </div>
          ) : (
            <>
              <div role="toolbar" aria-label="Choose a date" className="flex flex-wrap items-center gap-2">
                <IconButton icon={ChevronLeft} label="Previous day" onClick={() => goTo(shiftKey(date, -1))} />
                <IconButton icon={ChevronRight} label="Next day" onClick={() => goTo(shiftKey(date, 1))} />
                <div className="w-40">
                  <Input type="date" aria-label="Pick a date" value={date} onChange={(e) => goTo(e.target.value)} />
                </div>
                <Button variant="secondary" size="sm" onClick={() => goTo(today)} disabled={date === today}>Today</Button>
              </div>

              <div className="mt-5 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold tracking-tight text-slate-900">
                    {relative ? `${relative} · ` : ""}
                    {longDate(date, today)}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {day.scheduled.length === 0 ? "Nothing scheduled" : `${openCount} open · ${day.scheduled.length - openCount} done`}
                  </p>
                </div>
                {!adding && (
                  <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add task</Button>
                )}
              </div>

              {addedNote && <p role="status" className="mt-3 text-xs text-green-700">{addedNote}</p>}

              {adding && (
                <div className="mt-4">
                  <QuickAddTask key={date} defaultDate={date} goals={goals} onSubmit={submitNew} onCancel={() => setAdding(false)} />
                </div>
              )}

              {day.overdue.length > 0 && (
                <Group title="Overdue" count={day.overdue.length} tone="text-red-600">
                  {day.overdue.map((task) => row(task, true))}
                </Group>
              )}

              {day.scheduled.length > 0 && (
                <section aria-label={`Tasks for ${longDate(date, today)}`} className={day.overdue.length ? "mt-6" : "mt-3"}>
                  {day.overdue.length > 0 && (
                    <h3 className="mb-1 border-b border-slate-100 px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {relative ?? dayMonth(date)} <span className="font-normal">· {day.scheduled.length}</span>
                    </h3>
                  )}
                  <ul className="divide-y divide-slate-50">{day.scheduled.map((task) => row(task))}</ul>
                </section>
              )}

              {day.daily.length > 0 && (
                <Group title="Repeats daily" count={day.daily.length}>
                  {day.dailyMode === "today"
                    ? day.daily.map(({ task }) => row(task))
                    : day.daily.map(({ task, goal }) => (
                        <li key={task.id} className="flex items-center gap-3 px-1 py-2.5 text-sm text-slate-600">
                          <Repeat className="h-4 w-4 shrink-0 text-slate-300" aria-label="Repeats daily" />
                          <span className="min-w-0 flex-1 truncate">{task.title}</span>
                          <Link to={`/goals/${goal.id}`} className="shrink-0 truncate text-xs text-slate-400 hover:text-brand-700">{goal.title}</Link>
                        </li>
                      ))}
                </Group>
              )}

              {isEmpty && !adding && (
                <div className="mt-10 flex flex-col items-center gap-3 text-center">
                  <CalendarDays className="h-8 w-8 text-slate-300" aria-hidden="true" />
                  <p className="text-sm font-medium text-slate-700">No tasks scheduled for this date</p>
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding(true)}>Add task</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <TaskFormModal
        open={Boolean(editing)}
        task={editing}
        goals={goals}
        defaultGoalId={editing?.goalId ?? null}
        today={today}
        onSubmit={submitEdit}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

export default UpcomingPage;
