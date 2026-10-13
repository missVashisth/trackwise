import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, IconButton, Input } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { PERIODS, isCurrentRange, rangeLabel, stepPeriod } from "../insights.format.js";

const MAX_CUSTOM_DAYS = 366;

/** Week / Month / Custom with previous–next navigation. `range` is the server's resolved range. */
function PeriodSelector({ state, range, onChange, disabled }) {
  const [custom, setCustom] = useState({ from: state.from ?? range?.from ?? "", to: state.to ?? range?.to ?? "" });
  const [error, setError] = useState(null);

  function choose(period) {
    setError(null);
    if (period === "custom") {
      setCustom({ from: range?.from ?? "", to: range?.to ?? "" });
      onChange({ period: "custom", from: range?.from, to: range?.to });
    } else onChange({ period, date: null });
  }

  function applyCustom(event) {
    event.preventDefault();
    if (!custom.from || !custom.to) return setError("Choose both dates.");
    if (custom.from > custom.to) return setError("The start must be before the end.");
    const days = Math.round((Date.parse(custom.to) - Date.parse(custom.from)) / 86_400_000) + 1;
    if (days > MAX_CUSTOM_DAYS) return setError(`Choose at most ${MAX_CUSTOM_DAYS} days.`);
    setError(null);
    onChange({ period: "custom", from: custom.from, to: custom.to });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={state.period === p.value}
              disabled={disabled}
              onClick={() => choose(p.value)}
              className={cn("rounded-md px-3 py-1 text-xs font-medium", state.period === p.value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
            >
              {p.label}
            </button>
          ))}
        </div>
        {range && (
          <div className="flex items-center gap-1">
            <IconButton icon={ChevronLeft} label="Previous period" size="sm" onClick={() => onChange(stepPeriod(state, range, -1))} disabled={disabled} />
            <span className="min-w-36 text-center text-sm font-semibold text-slate-800" aria-live="polite">{rangeLabel(range)}</span>
            <IconButton icon={ChevronRight} label="Next period" size="sm" onClick={() => onChange(stepPeriod(state, range, 1))} disabled={disabled || isCurrentRange(range)} />
          </div>
        )}
      </div>
      {state.period === "custom" && (
        <form onSubmit={applyCustom} className="flex flex-wrap items-center gap-2" noValidate>
          <div className="w-36">
            <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" className="py-1.5" />
          </div>
          <span className="text-xs text-slate-500">to</span>
          <div className="w-36">
            <Input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" className="py-1.5" />
          </div>
          <Button type="submit" size="sm" variant="secondary">Apply</Button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </form>
      )}
    </div>
  );
}

export default PeriodSelector;
