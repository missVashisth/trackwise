import { GOAL_COLUMNS, GROUPING_OPTIONS } from "../goals.constants.js";
import { Select } from "../../../components/ui/index.js";

function GoalsViewPanel({ view, onGroupingChange, onSortChange }) {
  return (
    <div className="flex flex-col gap-3 p-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        Group by
        <Select value={view.grouping} options={GROUPING_OPTIONS} onChange={(e) => onGroupingChange(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        Sort by
        <Select
          value={view.sortKey}
          options={GOAL_COLUMNS.filter((c) => c.sortable).map((c) => ({ value: c.key, label: c.label }))}
          onChange={(e) => onSortChange(e.target.value)}
        />
      </label>
    </div>
  );
}

export default GoalsViewPanel;
