import { TaskRow } from "../../tasks/components/TaskGroupList.jsx";
import { Card } from "../../goals/components/dashboard/dashboardParts.jsx";
import { formatShortDate } from "../../../lib/date.js";
import { cn } from "../../../lib/cn.js";
import { formatMinutes } from "../roadmap.selectors.js";

/** Extra details on a roadmap task row: estimate, and when it was actually done. */
export function RoadmapTaskMeta({ task }) {
  return (
    <span className="hidden shrink-0 items-center gap-2 text-xs text-slate-400 sm:inline-flex">
      {task.estimatedMinutes ? <span>{formatMinutes(task.estimatedMinutes)}</span> : null}
      {task.completedAt && <span className="text-green-700">Done {formatShortDate(task.completedAt)}</span>}
    </span>
  );
}

/**
 * A list of roadmap tasks (one status group) in a card. Rows reuse the app's TaskRow, so ticking,
 * editing and deleting work exactly as in the other task lists.
 */
function RoadmapTaskSection({ title, description, tasks, emptyText, tone, canTick, tickHint, today, pendingIds, onToggle, onEdit, onDelete, action, limit, className }) {
  const shown = limit ? tasks.slice(0, limit) : tasks;
  return (
    <Card
      className={cn(tone === "danger" && tasks.length > 0 && "border-red-200", className)}
      title={
        <span className="inline-flex items-center gap-2">
          {title}
          <span className={cn("rounded-full px-1.5 text-[11px] font-medium", tone === "danger" && tasks.length ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600")}>
            {tasks.length}
          </span>
        </span>
      }
      description={description}
      action={action}
      bodyClassName="px-0 pb-2"
    >
      {tasks.length === 0 ? (
        <p className="px-4 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="border-t border-slate-100">
          {shown.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              canTick={canTick}
              tickHint={tickHint}
              pending={pendingIds.has(task.id)}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            >
              <RoadmapTaskMeta task={task} />
            </TaskRow>
          ))}
        </ul>
      )}
      {limit && tasks.length > limit && <p className="px-4 pt-2 text-xs text-slate-500">+{tasks.length - limit} more</p>}
    </Card>
  );
}

export default RoadmapTaskSection;
