import { Link } from "react-router";
import { ChevronDown, Star } from "lucide-react";
import { IconButton } from "../../../components/ui/index.js";
import { formatShortDate } from "../../../lib/date.js";
import { cn } from "../../../lib/cn.js";
import { getGoalColorHex, isCompleted } from "../goals.selectors.js";
import DeadlineBadge from "./DeadlineBadge.jsx";
import GoalIcon from "./GoalIcon.jsx";
import GoalProgress from "./GoalProgress.jsx";
import GoalRowMenu from "./GoalRowMenu.jsx";
import ImpactBolts from "./ImpactBolts.jsx";
import { DESKTOP_ONLY, GOAL_GRID } from "./goalGrid.js";

function GoalRow({ goal, lifeArea, depth = 0, subgoalCount = 0, expanded = false, onToggleExpand, actions }) {
  const colorHex = getGoalColorHex(goal, lifeArea);
  const completed = isCompleted(goal);

  return (
    <div
      id={`goal-${goal.id}`}
      role="row"
      className={cn(GOAL_GRID, "group min-h-13 border-b border-slate-100 px-4 transition hover:bg-slate-50/80", depth > 0 && "bg-slate-50/40")}
    >
      <div className="flex min-w-0 items-center gap-3 py-2.5" style={{ paddingLeft: depth * 28 }}>
        <GoalIcon colorHex={colorHex} completed={completed} size={depth > 0 ? "sm" : "md"} />
        <Link
          to={`/goals/${goal.id}`}
          className={cn(
            "min-w-0 truncate text-left text-sm font-medium text-slate-900 hover:text-brand-700",
            completed && "text-slate-400 line-through",
          )}
        >
          {goal.title}
        </Link>
        {goal.isFavorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Favorite" />}
      </div>

      <GoalProgress goal={goal} colorHex={colorHex} />

      <span className={DESKTOP_ONLY}><ImpactBolts impact={goal.impact} /></span>
      <span className={cn(DESKTOP_ONLY, "text-sm text-slate-600")}>{formatShortDate(goal.startDate)}</span>
      <span className={DESKTOP_ONLY}><DeadlineBadge deadline={goal.deadline} /></span>
      <span className={cn(DESKTOP_ONLY, "text-sm text-slate-500")}>{goal.tasksCount ?? 0}</span>

      <div className="flex items-center justify-end gap-0.5">
        <GoalRowMenu goal={goal} {...actions} />
        {subgoalCount > 0 ? (
          <IconButton
            icon={ChevronDown}
            size="sm"
            label={expanded ? "Hide subgoals" : `Show ${subgoalCount} subgoals`}
            onClick={onToggleExpand}
            className={cn("transition-transform", expanded && "rotate-180")}
          />
        ) : (
          <span className="h-7 w-7" />
        )}
      </div>
    </div>
  );
}

export default GoalRow;
