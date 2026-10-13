import { Link } from "react-router";
import { ArrowUpRight, CheckSquare, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { IconButton, ProgressRing } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { formatShortDate } from "../../../lib/date.js";
import { getProgress } from "../../goals/goals.selectors.js";

function DueBadge({ task, today }) {
  if (task.completedToday || !task.dueDate) return null;
  if (task.dueDate === today) return null;
  const overdue = today && task.dueDate < today;
  return (
    <span className={cn("shrink-0 text-xs", overdue ? "font-medium text-red-600" : "text-slate-500")}>
      {overdue ? "Overdue · " : ""}
      {formatShortDate(task.dueDate)}
    </span>
  );
}

/** When a roadmap task is planned, and whether it is overdue (status comes from the server). */
function ScheduleBadge({ task }) {
  if (task.roadmapStatus === "completed") {
    return <span className="shrink-0 text-xs text-slate-400">Planned {formatShortDate(task.scheduledDate)}</span>;
  }
  if (task.roadmapStatus === "today") return <span className="shrink-0 text-xs font-medium text-brand-700">Today</span>;
  const overdue = task.roadmapStatus === "pending";
  return (
    <span className={cn("shrink-0 text-xs", overdue ? "font-medium text-red-600" : "text-slate-500")} title={`Scheduled for ${formatShortDate(task.scheduledDate)}`}>
      {overdue ? "Overdue · " : ""}
      {formatShortDate(task.scheduledDate)}
    </span>
  );
}

export function TaskRow({ task, today, canTick, tickHint, pending, onToggle, onEdit, onDelete, children }) {
  return (
    <li className="group flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 hover:bg-slate-50/80 sm:px-5">
      <input
        type="checkbox"
        checked={task.completedToday}
        disabled={!canTick || pending}
        aria-busy={pending || undefined}
        onChange={() => onToggle(task)}
        title={canTick ? undefined : tickHint ?? "Tasks can be ticked only while their goal is running"}
        aria-label={task.completedToday ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
      />
      <button
        type="button"
        onClick={() => onEdit(task)}
        className={cn(
          "min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-900 hover:text-brand-700",
          task.completedToday && "text-slate-400 line-through",
        )}
      >
        {task.title}
      </button>
      {task.isTodo ? (
        <DueBadge task={task} today={today} />
      ) : task.isRoadmap ? (
        <ScheduleBadge task={task} />
      ) : (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600" title="Weightage">
          weight {task.weightage}
        </span>
      )}
      {children}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <IconButton icon={Pencil} size="sm" label="Edit task" onClick={() => onEdit(task)} />
        <IconButton icon={Trash2} size="sm" label="Delete task" onClick={() => onDelete(task)} />
      </div>
    </li>
  );
}

/**
 * A titled block of task rows that can be collapsed. The header stays visible (title, "x of y done",
 * extras such as progress); only the rows are hidden. `expanded`/`onToggle` come from the page.
 */
function CollapsibleSection({ id, label, icon, summary, extras, actions, expanded, onToggle, children }) {
  const panelId = `task-group-${id}`; // callers prefix ids when one goal can appear in two lists
  return (
    <section aria-label={label}>
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-2 py-1.5 sm:px-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", expanded && "rotate-90")} aria-hidden="true" />
          {icon}
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-xs font-normal text-slate-500">{summary}</span>
        </button>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          {extras}
          {actions}
        </div>
      </header>
      <ul id={panelId} hidden={!expanded}>
        {children}
      </ul>
    </section>
  );
}

const doneSummary = (tasks) => `${tasks.filter((t) => t.completedToday).length} of ${tasks.length} done`;

/** Standalone to-dos (tasks without a goal). */
export function TodoSection({ todos, today, pendingIds, onToggle, onEdit, onDelete, onAdd, expanded = true, onToggleExpanded = () => {} }) {
  return (
    <CollapsibleSection
      id="todos"
      label="To-do"
      icon={<CheckSquare className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />}
      summary={doneSummary(todos)}
      expanded={expanded}
      onToggle={onToggleExpanded}
      actions={<IconButton icon={Plus} size="sm" label="Add to-do" onClick={() => onAdd(null)} />}
    >
      {todos.map((task) => (
        <TaskRow key={task.id} task={task} today={today} canTick pending={pendingIds?.has(task.id)} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </CollapsibleSection>
  );
}

/**
 * Tasks grouped under their goal, with the goal's progress in each header. `idPrefix` keeps element
 * ids unique when the same goal is listed twice on a page; `summarize` writes the header summary.
 */
function TaskGroupList({ groups, pendingIds, onToggle, onEdit, onDelete, onAdd, isExpanded = () => true, onToggleExpanded = () => {}, idPrefix = "", summarize = doneSummary }) {
  return groups.map(({ goal, tasks }) => {
    const today = goal.progress?.today ?? 0;
    return (
      <CollapsibleSection
        key={goal.id}
        id={`${idPrefix}${goal.id}`}
        label={goal.title}
        icon={<ProgressRing value={getProgress(goal)} size={16} />}
        summary={summarize(tasks, goal)}
        expanded={isExpanded(goal.id, tasks)}
        onToggle={() => onToggleExpanded(goal.id, tasks)}
        extras={
          <span className="hidden sm:inline">
            {getProgress(goal)}% overall
            {today > 0 && <span className="ml-1 font-medium text-green-700">+{today}% today</span>}
          </span>
        }
        actions={
          <>
            <Link
              to={`/goals/${goal.id}`}
              aria-label={`Open ${goal.title}`}
              title="Open goal"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {!goal.completedAt && <IconButton icon={Plus} size="sm" label={`Add task to ${goal.title}`} onClick={() => onAdd(goal.id)} />}
          </>
        }
      >
        {tasks.length === 0 && <li className="px-4 py-2.5 text-xs text-slate-400 sm:px-5">No tasks yet{goal.completedAt ? "" : " — use + to add one"}.</li>}
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            // Roadmap tasks stay completable (also when overdue) until the goal is completed.
            canTick={task.isRoadmap ? !goal.completedAt : goal.isOngoing}
            pending={pendingIds?.has(task.id)}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </CollapsibleSection>
    );
  });
}

export default TaskGroupList;
