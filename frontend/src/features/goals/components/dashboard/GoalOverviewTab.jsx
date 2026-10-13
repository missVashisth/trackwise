import { Link } from "react-router";
import { CheckCircle2, Repeat } from "lucide-react";
import { ProgressRing, Skeleton } from "../../../../components/ui/index.js";
import { formatShortDate } from "../../../../lib/date.js";
import { TaskRow } from "../../../tasks/components/TaskGroupList.jsx";
import { getProgress } from "../../goals.selectors.js";
import { Card, Stat, StatusBadge } from "./dashboardParts.jsx";
import { formatPoints, goalStatusOf, plural, tickBlockedReason } from "./dashboard.utils.js";
import RoadmapTaskSection from "../../../roadmap/components/RoadmapTaskSection.jsx";

function TodayStat({ goal, status, tasks, todayDay, colorHex }) {
  const done = tasks.filter((t) => t.completedToday).length;
  const blocked = tickBlockedReason(status);
  const dailyMax = 100 / goal.totalDays;

  if (blocked) {
    return <Stat label="Today" value="—" detail={`${blocked}, so nothing is tracked today.`} />;
  }
  if (tasks.length === 0) {
    return <Stat label="Today" value="No tasks" detail="Add a daily task to start tracking." />;
  }
  // The weight-based share comes from the backend's record for today.
  const percent = todayDay?.completionPercent ?? Math.round((done / tasks.length) * 100);
  return (
    <Stat
      label="Today"
      value={`${done} of ${tasks.length} done`}
      detail={`+${formatPoints(goal.progress?.today ?? 0)}% to the goal (max ${formatPoints(dailyMax)}% a day)`}
    >
      <span className="relative flex shrink-0 items-center justify-center">
        <ProgressRing value={percent} size={44} stroke={4} color={colorHex} />
        <span className="absolute text-[11px] font-semibold text-slate-700">{percent}%</span>
      </span>
    </Stat>
  );
}

function PaceStat({ goal, status, insights }) {
  const overall = getProgress(goal);
  if (!insights) return <Stat label="Pace" value={<Skeleton className="h-6 w-20" />} />;
  const { timeline } = insights;
  if (status === "upcoming") {
    return <Stat label="Pace" value="Not started" detail={`Starts in ${plural(timeline.daysUntilStart, "day")}.`} />;
  }
  const ideal = timeline.idealProgress;
  if (status === "completed" || status === "ended") {
    return (
      <Stat
        label="Result"
        value={`${overall}%`}
        detail={`Full pace would have reached ${Math.round(ideal)}% over these ${plural(timeline.elapsedDays, "day")}.`}
      />
    );
  }
  const gap = Math.round((ideal - (goal.progress?.overall ?? 0)) * 10) / 10;
  return (
    <Stat
      label="Pace"
      value={gap <= 0 ? "On pace" : `${formatPoints(gap)} pts behind`}
      detail={`${overall}% done · full pace reaches ${Math.round(ideal)}% by the end of today`}
    />
  );
}

function ConsistencyStat({ insights }) {
  if (!insights) return <Stat label="Last 7 days" value={<Skeleton className="h-6 w-20" />} />;
  const week = insights.stats.last7Days;
  if (week.trackedDays === 0) {
    return <Stat label="Last 7 days" value="—" detail="No finished days with tasks yet." />;
  }
  return (
    <Stat
      label="Last 7 days"
      value={`${week.activeDays} of ${week.trackedDays} days`}
      detail={`with progress · ${plural(week.fullDays, "day")} fully done`}
    />
  );
}

function DeadlineStat({ goal, status, insights }) {
  if (status === "completed") {
    return <Stat label="Deadline" value="Completed" detail={`on ${formatShortDate(goal.completedAt)}`} />;
  }
  if (!goal.deadline) return <Stat label="Deadline" value="None" detail="This goal has no end date." />;
  if (status === "ended") return <Stat label="Deadline" value="Passed" detail={`Ended ${formatShortDate(goal.deadline)} — not marked complete.`} />;
  // Days after today, matching the countdown badge in the header.
  const left = insights ? Math.max(0, insights.timeline.remainingDays - 1) : null;
  return (
    <Stat
      label="Deadline"
      value={left == null ? formatShortDate(goal.deadline) : left === 0 ? "Last day today" : `${plural(left, "day")} left`}
      detail={`${formatShortDate(goal.deadline)} · day ${insights?.timeline.elapsedDays ?? "–"} of ${goal.totalDays}`}
    />
  );
}

function RecentActivity({ insights, colorHex }) {
  if (!insights) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-3/4" />)}
      </div>
    );
  }
  if (insights.recentActivity.length === 0) {
    return <p className="text-sm text-slate-500">No completed tasks yet. Ticked tasks show up here.</p>;
  }
  return (
    <ol className="flex flex-col gap-2.5">
      {insights.recentActivity.map((item) => (
        <li key={`${item.taskId}-${item.dateKey}`} className="flex items-start gap-2.5 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: colorHex }} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="font-medium text-slate-800">{item.title ?? "A deleted task"}</span>
            <span className="block text-xs text-slate-500">
              {item.dateKey === insights.today ? "Today" : formatShortDate(item.dateKey)}
              {" · "}
              {new Date(item.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---- Roadmap goals: progress is completed tasks / all roadmap tasks (from the backend).

function RoadmapTodayStat({ goal, groups }) {
  const doneToday = goal.progress?.roadmap?.completedToday ?? 0;
  const open = groups.today.length;
  return (
    <Stat
      label="Today"
      value={open === 0 ? "All clear" : `${plural(open, "task")} left`}
      detail={`${doneToday} done today${groups.pending.length ? ` · ${groups.pending.length} overdue` : ""}`}
    />
  );
}

function RoadmapProgressStat({ goal, colorHex }) {
  const { total = 0, completed = 0 } = goal.progress?.roadmap ?? {};
  const percent = getProgress(goal);
  return (
    <Stat label="Roadmap" value={`${completed} of ${total} done`} detail={`${percent}% of all roadmap tasks`}>
      <span className="relative flex shrink-0 items-center justify-center">
        <ProgressRing value={percent} size={44} stroke={4} color={colorHex} />
        <span className="absolute text-[11px] font-semibold text-slate-700">{percent}%</span>
      </span>
    </Stat>
  );
}

function RoadmapScheduleStat({ status, insights }) {
  if (!insights?.roadmap) return <Stat label="Schedule" value={<Skeleton className="h-6 w-20" />} />;
  const { plannedThroughToday, completed, total } = insights.roadmap;
  if (status === "upcoming") return <Stat label="Schedule" value="Not started" detail={`${plural(total, "task")} planned`} />;
  const behind = plannedThroughToday - completed;
  return (
    <Stat
      label="Schedule"
      value={behind <= 0 ? "On schedule" : `${plural(behind, "task")} behind`}
      detail={`${plannedThroughToday} of ${total} were planned up to today`}
    />
  );
}

/** Daily (recurring) tasks still to tick today. */
function DailyRemainingCard({ tasks, status, today, pendingIds, onToggle, onEditTask, onDeleteTask, onShowTab, className }) {
  const blocked = tickBlockedReason(status);
  const remaining = tasks.filter((t) => !t.completedToday);
  return (
    <Card
      className={className}
      title="Daily tasks — remaining today"
      description={blocked ? blocked : "Daily tasks repeat every day; anything left unticked resets tomorrow rather than piling up."}
      action={
        tasks.length > 0 && (
          <button type="button" onClick={() => onShowTab("tasks")} className="text-xs font-medium text-brand-700 hover:underline">
            All tasks
          </button>
        )
      }
      bodyClassName="px-0 pb-2"
    >
      {tasks.length === 0 ? (
        <p className="px-4 text-sm text-slate-500">
          This goal has no tasks yet.{" "}
          <button type="button" onClick={() => onShowTab("tasks")} className="font-medium text-brand-700 hover:underline">Add one</button>
        </p>
      ) : blocked ? (
        <p className="px-4 text-sm text-slate-500">{plural(tasks.length, "daily task")} — ticking is only possible while the goal is running.</p>
      ) : remaining.length === 0 ? (
        <p className="flex items-center gap-2 px-4 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Every daily task is done for today.
        </p>
      ) : (
        <ul className="border-t border-slate-100">
          {remaining.map((task) => (
            <TaskRow key={task.id} task={task} today={today} canTick pending={pendingIds.has(task.id)} onToggle={onToggle} onEdit={onEditTask} onDelete={onDeleteTask}>
              <span className="hidden shrink-0 items-center gap-1 text-xs text-slate-400 sm:inline-flex" title="Repeats daily">
                <Repeat className="h-3 w-3" aria-hidden="true" />
                Daily
              </span>
            </TaskRow>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GoalOverviewTab({ goal, status, colorHex, tasks, roadmapTasks, roadmapGroups, today, insights, subgoals, pendingIds, onToggle, onEditTask, onDeleteTask, onShowTab }) {
  const todayDay = insights?.series.find((d) => d.isToday) ?? null;
  const hasRoadmap = roadmapTasks.length > 0;
  const upcomingSubgoals = subgoals
    .filter((g) => !g.completedAt)
    .sort((a, b) => String(a.deadline ?? "").localeCompare(String(b.deadline ?? "")))
    .slice(0, 3);
  const rowActions = { today, pendingIds, onToggle, onEdit: onEditTask, onDelete: onDeleteTask };
  const roadmapLocked = status === "completed" ? "This goal is completed" : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {hasRoadmap ? (
          <>
            <RoadmapTodayStat goal={goal} groups={roadmapGroups} />
            <RoadmapProgressStat goal={goal} colorHex={colorHex} />
            <RoadmapScheduleStat status={status} insights={insights} />
          </>
        ) : (
          <>
            <TodayStat goal={goal} status={status} tasks={tasks} todayDay={todayDay} colorHex={colorHex} />
            <PaceStat goal={goal} status={status} insights={insights} />
            <ConsistencyStat insights={insights} />
          </>
        )}
        <DeadlineStat goal={goal} status={status} insights={insights} />
      </div>

      {hasRoadmap ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <RoadmapTaskSection
              title="Today’s tasks"
              description={`Scheduled for today (${formatShortDate(today)})`}
              tasks={roadmapGroups.today}
              emptyText={roadmapGroups.pending.length ? "Nothing scheduled for today is left — see the pending tasks." : "Nothing left for today."}
              canTick={!roadmapLocked}
              tickHint={roadmapLocked}
              {...rowActions}
            />
            <RoadmapTaskSection
              title="Pending tasks"
              description="Scheduled on earlier days and not done yet — they keep their original date."
              tasks={roadmapGroups.pending}
              emptyText="Nothing overdue."
              tone="danger"
              canTick={!roadmapLocked}
              tickHint={roadmapLocked}
              {...rowActions}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RoadmapTaskSection
              title="Recently completed"
              tasks={roadmapGroups.completed}
              emptyText="Completed roadmap tasks show up here."
              limit={5}
              canTick={!roadmapLocked}
              tickHint={roadmapLocked}
              action={
                <button type="button" onClick={() => onShowTab("roadmap")} className="text-xs font-medium text-brand-700 hover:underline">
                  Open roadmap
                </button>
              }
              {...rowActions}
            />
            {tasks.length > 0 ? (
              <DailyRemainingCard tasks={tasks} status={status} today={today} pendingIds={pendingIds} onToggle={onToggle} onEditTask={onEditTask} onDeleteTask={onDeleteTask} onShowTab={onShowTab} />
            ) : (
              <RoadmapTaskSection
                title="Coming up"
                tasks={roadmapGroups.upcoming}
                emptyText="No more tasks are scheduled."
                limit={5}
                canTick={!roadmapLocked}
                tickHint={roadmapLocked}
                {...rowActions}
              />
            )}
          </div>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <DailyRemainingCard className="lg:col-span-3" tasks={tasks} status={status} today={today} pendingIds={pendingIds} onToggle={onToggle} onEditTask={onEditTask} onDeleteTask={onDeleteTask} onShowTab={onShowTab} />
          <Card className="lg:col-span-2" title="Recent activity" description="Latest ticked tasks of this goal">
            <RecentActivity insights={insights} colorHex={colorHex} />
          </Card>
        </div>
      )}

      {upcomingSubgoals.length > 0 && (
        <Card title="Coming up" description="Open subgoals by deadline">
          <ul className="flex flex-col divide-y divide-slate-100">
            {upcomingSubgoals.map((sub) => (
              <li key={sub.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <Link to={`/goals/${sub.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 hover:text-brand-700">{sub.title}</Link>
                <StatusBadge status={goalStatusOf(sub)} />
                <span className="w-20 shrink-0 text-right text-xs text-slate-500">{sub.deadline ? formatShortDate(sub.deadline) : "No deadline"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default GoalOverviewTab;
