import { useState } from "react";
import { Target } from "lucide-react";
import { Button, EmptyState, Skeleton } from "../../../components/ui/index.js";
import GoalGroup from "./GoalGroup.jsx";
import GoalsTableHeader from "./GoalsTableHeader.jsx";

function LoadingRows() {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="hidden h-4 w-12 lg:block" />
          <Skeleton className="hidden h-4 w-16 lg:block" />
        </div>
      ))}
    </div>
  );
}

function GoalsTable({ loading, groups, lifeAreaById, subgoalsByParent, view, onSort, hasFilters, onClearFilters, onCreate, actions }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isEmpty = !loading && groups.every((g) => g.goals.length === 0);

  return (
    <div role="table" aria-label="Goals" className="flex flex-col">
      <GoalsTableHeader sortKey={view.sortKey} sortDir={view.sortDir} onSort={onSort} />

      {loading && <LoadingRows />}

      {isEmpty && (
        <EmptyState
          icon={Target}
          title={hasFilters ? "No goals match these filters" : "No goals yet"}
          description={
            hasFilters
              ? "Try clearing a filter or two to see more of your goals."
              : "Turn an ambition into a measurable plan. Start with a verb, like “Run a marathon”."
          }
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={onClearFilters}>Clear filters</Button>
            ) : (
              <Button onClick={onCreate}>Create your first goal</Button>
            )
          }
        />
      )}

      {!loading &&
        groups.map((group) => (
          <GoalGroup
            key={group.key}
            group={group}
            lifeAreaById={lifeAreaById}
            subgoalsByParent={subgoalsByParent}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            actions={actions}
          />
        ))}
    </div>
  );
}

export default GoalsTable;
