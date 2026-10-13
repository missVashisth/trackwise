import { Filter, Menu, Plus, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button, IconButton, Popover } from "../../../components/ui/index.js";
import GoalsFilterPanel from "./GoalsFilterPanel.jsx";
import GoalsViewPanel from "./GoalsViewPanel.jsx";

function GoalsHeader({ subtitle, lifeAreas, view, activeFilterCount, onFiltersChange, onResetView, onGroupingChange, onSortChange, onCreate, onCreateWithRoadmap, onOpenSidebar }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="lg:hidden" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">My Goals</h1>
          {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Popover
          width="w-64"
          trigger={({ active, ...props }) => (
            <span className="relative">
              <IconButton icon={Filter} label="Filter goals" active={active || activeFilterCount > 0} {...props} />
              {activeFilterCount > 0 && (
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </span>
          )}
        >
          <GoalsFilterPanel filters={view.filters} lifeAreas={lifeAreas} onChange={onFiltersChange} onReset={onResetView} />
        </Popover>

        <Popover
          width="w-56"
          trigger={({ active, ...props }) => <IconButton icon={SlidersHorizontal} label="View options" active={active} {...props} />}
        >
          <GoalsViewPanel view={view} onGroupingChange={onGroupingChange} onSortChange={onSortChange} />
        </Popover>

        {onCreateWithRoadmap && (
          <Button variant="secondary" icon={Sparkles} onClick={onCreateWithRoadmap} className="ml-1" aria-label="AI roadmap">
            <span className="hidden sm:inline">AI roadmap</span>
          </Button>
        )}
        <Button icon={Plus} onClick={onCreate} className="ml-1" aria-label="New goal">
          <span className="hidden sm:inline">New goal</span>
        </Button>
      </div>
    </div>
  );
}

export default GoalsHeader;
