import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { IconButton } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import GoalRow from "./GoalRow.jsx";
import LifeAreaAvatar from "./LifeAreaAvatar.jsx";

function GoalGroup({ group, lifeAreaById, subgoalsByParent, expandedIds, onToggleExpand, actions }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section aria-label={group.label ?? "All goals"}>
      {group.label && (
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            {group.lifeArea && <LifeAreaAvatar lifeArea={group.lifeArea} />}
            <span>{group.label}</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span className="rounded-full bg-slate-200/70 px-1.5 text-[11px] font-medium text-slate-600">{group.goals.length}</span>
          </div>
          <IconButton
            icon={ChevronDown}
            size="sm"
            label={collapsed ? "Expand group" : "Collapse group"}
            onClick={() => setCollapsed((v) => !v)}
            className={cn("transition-transform", collapsed && "-rotate-90")}
          />
        </header>
      )}

      {!collapsed &&
        group.goals.map((goal) => {
          const subgoals = subgoalsByParent.get(goal.id) ?? [];
          const expanded = expandedIds.has(goal.id);

          return (
            <div key={goal.id}>
              <GoalRow
                goal={goal}
                lifeArea={lifeAreaById.get(goal.lifeAreaId)}
                subgoalCount={subgoals.length}
                expanded={expanded}
                onToggleExpand={() => onToggleExpand(goal.id)}
                actions={actions}
              />
              {expanded &&
                subgoals.map((subgoal) => (
                  <GoalRow
                    key={subgoal.id}
                    goal={subgoal}
                    lifeArea={lifeAreaById.get(subgoal.lifeAreaId)}
                    depth={1}
                    actions={actions}
                  />
                ))}
            </div>
          );
        })}
    </section>
  );
}

export default GoalGroup;
