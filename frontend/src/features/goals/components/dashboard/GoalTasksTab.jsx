import { ListChecks, Plus, Repeat } from "lucide-react";
import { Button, EmptyState } from "../../../../components/ui/index.js";
import { formatShortDate } from "../../../../lib/date.js";
import { TaskRow } from "../../../tasks/components/TaskGroupList.jsx";
import { Card } from "./dashboardParts.jsx";
import { plural, tickBlockedReason } from "./dashboard.utils.js";
import RoadmapTaskSection from "../../../roadmap/components/RoadmapTaskSection.jsx";

function LastDone({ history, today }) {
  if (!history) return null;
  const last = history.lastCompletedDateKey;
  return (
    <span className="hidden w-28 shrink-0 text-right text-xs text-slate-400 md:inline" title={`Done on ${plural(history.totalCompletions, "day")} in total`}>
      {last ? `Last done ${last === today ? "today" : formatShortDate(last)}` : "Never done yet"}
    </span>
  );
}

function DailyTasksCard({ goal, status, tasks, today, insights, pendingIds, onToggle, onAdd, onEdit, onDelete, hasRoadmap }) {
  const blocked = tickBlockedReason(status);
  const canAdd = status !== "completed";
  const done = tasks.filter((t) => t.completedToday).length;
  const historyById = new Map((insights?.tasks ?? []).map((t) => [String(t.taskId), t]));
  const totalWeight = tasks.reduce((sum, t) => sum + (t.weightage ?? 0), 0);

  if (tasks.length === 0 && hasRoadmap) {
    return (
      <Card
        title="Daily tasks"
        description="Recurring tasks repeat every day while the goal runs. This goal has none."
        action={canAdd && <Button size="sm" variant="secondary" icon={Plus} onClick={onAdd}>Add daily task</Button>}
      />
    );
  }
  if (tasks.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ListChecks}
          title="No tasks yet"
          description={
            canAdd
              ? "Add the daily tasks that move this goal forward. Each one repeats every day until the goal is completed or the task is deleted."
              : "This goal is completed. Reopen it to add tasks."
          }
          action={canAdd && <Button icon={Plus} onClick={onAdd}>Add a task</Button>}
        />
      </Card>
    );
  }

  return (
    <Card
      title={`${plural(tasks.length, "daily task")} · ${done} done today`}
      description={
        blocked
          ? `${blocked}, so tasks can’t be ticked right now.`
          : `Ticks count for today (${formatShortDate(today)}) only; every task resets at midnight in your time zone.`
      }
      action={canAdd && <Button size="sm" icon={Plus} onClick={onAdd}>Add task</Button>}
      bodyClassName="px-0 pb-2"
    >
      <ul className="border-t border-slate-100">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            today={today}
            canTick={!blocked}
            tickHint={blocked ?? undefined}
            pending={pendingIds.has(task.id)}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          >
            <span className="hidden shrink-0 items-center gap-1 text-xs text-slate-400 sm:inline-flex" title="Share of each day’s progress">
              <Repeat className="h-3 w-3" aria-hidden="true" />
              {totalWeight > 0 ? `${Math.round(((task.weightage ?? 0) / totalWeight) * 100)}% of a day` : "Daily"}
            </span>
            <LastDone history={historyById.get(task.id)} today={today} />
          </TaskRow>
        ))}
      </ul>
      <p className="px-4 pt-3 text-xs text-slate-500">
        Each day this goal can gain up to {Math.round((100 / goal.totalDays) * 100) / 100}% — split between tasks by weightage.
      </p>
    </Card>
  );
}

function GoalTasksTab({ goal, status, tasks, roadmapTasks, roadmapGroups, today, insights, pendingIds, onToggle, onAdd, onAddRoadmapTask, onEdit, onDelete }) {
  const hasRoadmap = roadmapTasks.length > 0;
  const locked = status === "completed" ? "This goal is completed" : undefined;
  const rowProps = { today, pendingIds, onToggle, onEdit, onDelete, canTick: !locked, tickHint: locked };

  return (
    <div className="flex flex-col gap-4">
      {hasRoadmap && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <RoadmapTaskSection
              title="Today’s tasks"
              description={`Scheduled for ${formatShortDate(today)}`}
              tasks={roadmapGroups.today}
              emptyText="Nothing scheduled for today is left."
              action={!locked && <Button size="sm" variant="secondary" icon={Plus} onClick={onAddRoadmapTask}>Schedule task</Button>}
              {...rowProps}
            />
            <RoadmapTaskSection
              title="Pending tasks"
              description="From earlier days, still open. Completing one keeps its original date."
              tasks={roadmapGroups.pending}
              emptyText="Nothing overdue."
              tone="danger"
              {...rowProps}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RoadmapTaskSection title="Upcoming" tasks={roadmapGroups.upcoming} emptyText="No more tasks scheduled." {...rowProps} />
            <RoadmapTaskSection title="Completed" tasks={roadmapGroups.completed} emptyText="Nothing completed yet." {...rowProps} />
          </div>
        </>
      )}
      <DailyTasksCard
        goal={goal}
        status={status}
        tasks={tasks}
        today={today}
        insights={insights}
        pendingIds={pendingIds}
        onToggle={onToggle}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
        hasRoadmap={hasRoadmap}
      />
    </div>
  );
}

export default GoalTasksTab;
