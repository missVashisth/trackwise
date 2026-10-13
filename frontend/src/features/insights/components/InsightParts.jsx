// Presentational building blocks for the Insights pages.

import { useId } from "react";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { cn } from "../../../lib/cn.js";
import { DAY_STATUS_META, formatChange, shortDay, weekdayShort } from "../insights.format.js";

/** A titled block (a region named by its title). `flush` removes the inner padding (for lists). */
export function Section({ title, description, children, action, className, flush = false }) {
  const titleId = useId();
  return (
    <section aria-labelledby={title ? titleId : undefined} className={cn("flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 id={titleId} className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("flex-1", flush ? "pb-2 pt-2" : "px-5 pb-5 pt-3")}>{children}</div>
    </section>
  );
}

/** Hover/focus explanation of how a number is calculated. */
export function Definition({ label, children }) {
  if (!children) return null;
  return (
    <span className="group relative inline-flex">
      <button type="button" className="rounded text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`How "${label}" is calculated`}>
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-5 z-30 hidden w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-normal leading-snug text-white shadow-lg group-focus-within:block group-hover:block">
        {children}
      </span>
    </span>
  );
}

/** Change vs the previous period, with an arrow (colour is only a secondary signal). */
export function Delta({ change, unit = "pts", className }) {
  const delta = formatChange(change, unit);
  if (!delta) return null;
  const Arrow = delta.tone === "up" ? ArrowUpRight : delta.tone === "down" ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", delta.tone === "up" && "text-green-700", delta.tone === "down" && "text-red-600", delta.tone === "neutral" && "text-slate-500", className)}>
      <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
      {delta.text}
    </span>
  );
}

/** One headline number. `primary` makes it the visual anchor of the page. */
export function MetricCard({ label, value, detail, definition, change, changeUnit, primary = false, children }) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-2xl border p-5", primary ? "border-brand-200 bg-gradient-to-br from-brand-50/80 to-white" : "border-slate-200/80 bg-white")}>
      <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
        {label}
        <Definition label={label}>{definition}</Definition>
      </div>
      <div className={cn("mt-1.5 font-semibold tracking-tight text-slate-900", primary ? "text-4xl" : "text-2xl")}>{value}</div>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
      {change !== undefined && <Delta change={change} unit={changeUnit} className="mt-1.5" />}
      {children}
    </div>
  );
}

const TONE = {
  positive: "bg-green-50 text-green-700 ring-green-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  negative: "bg-red-50 text-red-700 ring-red-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** Health label from the server's explicit rules (the text, not the colour, carries the meaning). */
export function StatusPill({ health, title }) {
  if (!health) return null;
  return (
    <span title={title ?? health.reason} className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONE[health.tone] ?? TONE.neutral)}>
      {health.label}
    </span>
  );
}

/** Secondary navigation inside a page (keyboard: arrow keys). */
export function SubTabs({ tabs, active, onChange, label }) {
  function onKeyDown(event) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = tabs.findIndex((t) => t.id === active);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onChange(next.id);
    document.getElementById(`subtab-${next.id}`)?.focus();
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`subtab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          tabIndex={active === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={cn("shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", active === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A short list of written insights. */
export function InsightList({ items, empty = "Nothing stands out yet.", icon: Icon, tone = "text-slate-400", limit }) {
  const shown = limit ? items.slice(0, limit) : items;
  if (!shown.length) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {shown.map((item) => (
        <li key={item.id} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
          {Icon && <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} aria-hidden="true" />}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyNote({ children = "Not enough data yet for this period." }) {
  return <p className="flex min-h-28 items-center justify-center rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}

/** A tiny trend line for list rows; null values are gaps. */
export function MiniTrend({ values, color = "#4f46e5", max = 100, label }) {
  const points = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null && p.v !== undefined);
  if (points.length < 2) return <span className="inline-block h-6 w-20 text-center text-[10px] leading-6 text-slate-300">—</span>;
  const w = 80;
  const h = 24;
  const x = (i) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v) => h - 2 - (Math.min(v, max) / max) * (h - 4);
  const d = points.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} role="img" aria-label={label} className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.at(-1).i)} cy={y(points.at(-1).v)} r="2.25" fill={color} />
    </svg>
  );
}

/**
 * Calendar heatmap: one column per week (Monday on top), one cell per day.
 * days: [{ dateKey, status, title? }] with statuses from DAY_STATUS_META.
 */
export function CalendarHeatmap({ days, legend = ["complete", "partial", "missed", "none", "pending", "future"] }) {
  if (!days.length) return <EmptyNote />;
  const first = days[0].dateKey;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const cells = [...Array(offset).fill(null), ...days];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const counts = days.reduce((acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }), {});
  const summary = Object.entries(counts).map(([s, n]) => `${n} ${DAY_STATUS_META[s]?.label.toLowerCase() ?? s}`).join(", ");
  const big = weeks.length <= 2;
  const size = big ? "h-9 w-9" : weeks.length <= 6 ? "h-6 w-6" : "h-3.5 w-3.5";
  const rowHeight = big ? "h-9" : weeks.length <= 6 ? "h-6" : "h-3.5";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-1 text-[10px] text-slate-400" aria-hidden="true">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => <span key={i} className={cn("flex items-center pr-1", rowHeight)}>{d}</span>)}
        </div>
        <div className="flex gap-1" role="img" aria-label={`Calendar: ${summary}.`}>
          {weeks.map((week, w) => (
            <div key={w} className="grid grid-rows-7 gap-1">
              {Array.from({ length: 7 }, (_, d) => {
                const day = week[d];
                if (!day) return <span key={d} className={size} />;
                const meta = DAY_STATUS_META[day.status] ?? DAY_STATUS_META.none;
                return (
                  <span
                    key={day.dateKey}
                    title={`${weekdayShort(day.dateKey)} ${shortDay(day.dateKey)}: ${day.title ?? meta.label}`}
                    className={cn("rounded-[4px]", size, big && "flex items-center justify-center text-[10px] text-slate-600", meta.className)}
                  >
                    {big ? Number(day.dateKey.slice(8)) : null}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {legend.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-[3px]", DAY_STATUS_META[s].className)} />
            {DAY_STATUS_META[s].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
