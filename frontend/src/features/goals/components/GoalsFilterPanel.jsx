import { IMPACT_OPTIONS, STATUS_OPTIONS } from "../goals.constants.js";
import { Button } from "../../../components/ui/index.js";
import LifeAreaAvatar from "./LifeAreaAvatar.jsx";

function CheckRow({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      {children}
    </label>
  );
}

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function GoalsFilterPanel({ filters, lifeAreas, onChange, onReset }) {
  return (
    <div className="flex flex-col gap-3 p-1.5">
      <fieldset>
        <legend className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</legend>
        <div className="flex gap-1 px-1">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ status: option.value })}
              className={
                filters.status === option.value
                  ? "rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white"
                  : "rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Life areas</legend>
        {lifeAreas.map((area) => (
          <CheckRow
            key={area.id}
            checked={filters.lifeAreaIds.includes(area.id)}
            onChange={() => onChange({ lifeAreaIds: toggleInList(filters.lifeAreaIds, area.id) })}
          >
            <LifeAreaAvatar lifeArea={area} size="sm" />
            {area.name}
          </CheckRow>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Impact</legend>
        {IMPACT_OPTIONS.map((option) => (
          <CheckRow
            key={option.value}
            checked={filters.impacts.includes(option.value)}
            onChange={() => onChange({ impacts: toggleInList(filters.impacts, option.value) })}
          >
            {option.label}
          </CheckRow>
        ))}
      </fieldset>

      <div className="border-t border-slate-100 pt-2">
        <Button variant="ghost" size="sm" onClick={onReset} className="w-full">Reset filters</Button>
      </div>
    </div>
  );
}

export default GoalsFilterPanel;
