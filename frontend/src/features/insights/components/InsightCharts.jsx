// Recharts visualisations for Insights. The chart type follows the question:
//   lines / areas – how something changed over time (progress, rates, values)
//   bars          – comparing separate things (habits, weekdays, periods against a target)
// All values come from the server's report; gaps stay gaps (no interpolation), and points are
// joined with straight segments so no curve suggests values between recorded points.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COLOR_HEX } from "../../goals/goals.constants.js";
import { shortDay, weekdayShort } from "../insights.format.js";
import { trimLeadingEmpty } from "../insights.charts.js";
import { EmptyNote } from "./InsightParts.jsx";

const BRAND = "#4f46e5";
const HABIT = "#16a34a";
const MUTED = "#cbd5e1";
const MISSED = "#ef4444";
const SERIES_COLORS = ["#4f46e5", "#0d9488", "#ea580c", "#db2777", "#2563eb"];
const axis = { fontSize: 11, fill: "#94a3b8" };
const grid = <CartesianGrid vertical={false} stroke="#f1f5f9" />;
const tooltipStyle = {
  contentStyle: { borderRadius: 10, borderColor: "#e2e8f0", fontSize: 12, boxShadow: "0 4px 12px rgb(15 23 42 / 0.08)" },
  labelStyle: { color: "#0f172a", fontWeight: 600, marginBottom: 2 },
};
const pctTick = (v) => `${v}%`;
const dayTick = (key, total) => (total <= 7 ? weekdayShort(key) : shortDay(key));
const dayLabel = (key) => `${weekdayShort(key)} ${shortDay(key)}`;
const monthName = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "short" });
const colorOf = (c, fallback = BRAND) => COLOR_HEX[c] ?? fallback;
const xDays = (n) => ({ dataKey: "dateKey", tickFormatter: (k) => dayTick(k, n), tick: axis, tickLine: false, axisLine: false, interval: "preserveStartEnd", minTickGap: 12 });

/**
 * Completion rates across successive weeks or months (lines show rises, falls and plateaus).
 * series: [{ key, name, color, countKey }]; null rates are gaps (nothing to measure).
 */
export function TrendLineChart({ buckets, series, unit, height = 240 }) {
  const label = (b) => (unit === "month" ? monthName(b.from) : shortDay(b.from));
  const data = trimLeadingEmpty(buckets, series.map((s) => s.key)).map((b) => ({ ...b, label: label(b) }));
  if (!data.some((d) => series.some((s) => d[s.key] !== null && d[s.key] !== undefined))) return <EmptyNote>Not enough history yet to show a trend.</EmptyNote>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={pctTick} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(_, p) => (p?.[0] ? (unit === "month" ? monthName(p[0].payload.from) : `Week of ${shortDay(p[0].payload.from)}`) : "")}
          formatter={(value, name, item) => {
            const s = series.find((x) => x.name === name);
            const n = s?.countKey ? item.payload[s.countKey] : undefined;
            return [value === null || value === undefined ? "nothing scheduled" : `${Math.round(value)}%${n !== undefined ? ` of ${n} scheduled` : ""}`, name];
          }}
        />
        {series.length > 1 && <Legend verticalAlign="top" align="right" height={24} iconType="plainline" wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s) => (
          <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.25} dot={{ r: 3, strokeWidth: 0, fill: s.color }} activeDot={{ r: 5 }} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * A goal's overall progress through the period (area), with the "full pace" reference (dashed)
 * and flat stretches shaded. Only finished days are drawn.
 */
export function ProgressChart({ series, color, plateaus = [], showExpected = true, height = 260 }) {
  const data = series.filter((d) => !d.future);
  if (!data.length) return <EmptyNote>This period hasn’t started yet.</EmptyNote>;
  const stroke = colorOf(color);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis {...xDays(data.length)} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={pctTick} tick={axis} tickLine={false} axisLine={false} />
        {plateaus.map((p) => (
          <ReferenceArea key={p.from} x1={p.from} x2={p.to} fill="#94a3b8" fillOpacity={0.08} strokeOpacity={0} ifOverflow="extendDomain" />
        ))}
        <Tooltip
          {...tooltipStyle}
          labelFormatter={dayLabel}
          formatter={(value, name, item) => (name === "Full pace" ? [`${value}%`, name] : [`${value}% overall · +${item.payload.progress ?? 0} that day`, "Progress"])}
        />
        {showExpected && <Line type="linear" dataKey="expected" name="Full pace" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} />}
        <Area type="linear" dataKey="cumulative" name="Progress" stroke={stroke} strokeWidth={2.25} fill="url(#progressFill)" dot={data.length <= 14 ? { r: 2.5, strokeWidth: 0, fill: stroke } : false} activeDot={{ r: 5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Several goals' overall progress over the period, one line each. */
export function GoalsProgressChart({ goals, height = 260 }) {
  const withData = goals.filter((g) => g.progressSeries?.length);
  if (!withData.length) return <EmptyNote>No goal ran during this period.</EmptyNote>;
  const byDay = new Map();
  withData.forEach((g, i) => {
    for (const p of g.progressSeries) {
      const row = byDay.get(p.dateKey) ?? { dateKey: p.dateKey };
      row[`g${i}`] = p.cumulative;
      byDay.set(p.dateKey, row);
    }
  });
  const data = [...byDay.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
        {grid}
        <XAxis {...xDays(data.length)} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={pctTick} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} labelFormatter={dayLabel} formatter={(v, name) => [`${v}%`, name]} />
        <Legend verticalAlign="top" align="right" height={24} iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
        {withData.map((g, i) => (
          <Line key={g.goalId} type="linear" dataKey={`g${i}`} name={g.title} stroke={COLOR_HEX[g.color] ?? SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Share of scheduled items done each day (gaps where nothing was scheduled). */
export function DailyCompletionChart({ points, height = 220, color = BRAND }) {
  if (!points.some((p) => p.rate !== null)) return <EmptyNote>Nothing was scheduled in this period yet.</EmptyNote>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
        {grid}
        <XAxis {...xDays(points.length)} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={pctTick} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} labelFormatter={dayLabel} formatter={(v, _n, item) => [v === null ? "nothing scheduled" : `${v}% (${item.payload.completed} of ${item.payload.scheduled})`, "Completed"]} />
        <Line type="linear" dataKey="rate" name="Completed" stroke={color} strokeWidth={2.25} dot={{ r: 3, strokeWidth: 0, fill: color }} activeDot={{ r: 5 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** How much was recorded each day (completions and habit progress), as a soft area. */
export function ActivityAreaChart({ points, height = 200 }) {
  if (!points.some((p) => p.activity > 0)) return <EmptyNote>No activity recorded in this period yet.</EmptyNote>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.2} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis {...xDays(points.length)} />
        <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} labelFormatter={dayLabel} formatter={(v) => [`${v} recorded`, "Activity"]} />
        <Area type="linear" dataKey="activity" name="Activity" stroke={BRAND} strokeWidth={2} fill="url(#activityFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * One habit's logged values over time: the percentage, or the actual amount against its target.
 * Missed scheduled days are red markers at 0; rest days are gaps.
 */
export function HabitValueChart({ points, trackingMethod, target, unit, color, height = 240 }) {
  if (!points.some((p) => p.value !== null || p.missed !== null)) return <EmptyNote>No scheduled or logged days in this period yet.</EmptyNote>;
  const stroke = colorOf(color, HABIT);
  const measurable = trackingMethod === "measurable";
  const max = measurable ? Math.max(target ?? 0, ...points.map((p) => p.value ?? 0)) : 100;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={points} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
        {grid}
        <XAxis {...xDays(points.length)} />
        <YAxis domain={[0, Math.ceil(max * 1.1) || 1]} tickFormatter={measurable ? undefined : pctTick} tick={axis} tickLine={false} axisLine={false} />
        <ReferenceLine y={measurable ? target : 100} stroke="#94a3b8" strokeDasharray="5 4" label={{ value: measurable ? `Target ${target} ${unit}` : "Done", position: "insideTopRight", fontSize: 10, fill: "#64748b" }} />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={dayLabel}
          formatter={(v, name, item) => {
            if (name === "Missed") return ["scheduled, not done", "Missed"];
            const note = item.payload.note ? ` · “${item.payload.note}”` : "";
            return [`${v}${measurable ? ` ${unit}` : "%"}${note}`, measurable ? "Done" : "Progress"];
          }}
        />
        <Line type="linear" dataKey="value" name="Value" stroke={stroke} strokeWidth={2.25} dot={{ r: 3.5, strokeWidth: 0, fill: stroke }} activeDot={{ r: 5 }} connectNulls={false} />
        <Scatter dataKey="missed" name="Missed" fill="#fff" stroke={MISSED} strokeWidth={2} shape="circle" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Checkbox habits: running totals of scheduled vs completed days — the gap shows what was missed. */
export function OccurrencesChart({ points, color, height = 240 }) {
  if (!points.length || points.at(-1).scheduled === 0) return <EmptyNote>No scheduled days have ended in this period yet.</EmptyNote>;
  const stroke = colorOf(color, HABIT);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
        {grid}
        <XAxis {...xDays(points.length)} />
        <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} labelFormatter={dayLabel} />
        <Legend verticalAlign="top" align="right" height={24} iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
        <Line type="stepAfter" dataKey="scheduled" name="Scheduled so far" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
        <Line type="stepAfter" dataKey="completed" name="Completed so far" stroke={stroke} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Flexible habits: sessions earned in each week/month against that period's target. */
export function PeriodTargetChart({ periods, periodType, color, height = 220 }) {
  if (!periods.length) return <EmptyNote>No {periodType} has started in this range yet.</EmptyNote>;
  const data = periods.map((p) => ({ ...p, label: periodType === "month" ? monthName(p.from) : shortDay(p.from) }));
  const fill = colorOf(color, HABIT);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} labelFormatter={(_, p) => (p?.[0] ? `${periodType === "month" ? "Month" : "Week"} of ${shortDay(p[0].payload.from)}${p[0].payload.ended ? "" : " (in progress)"}` : "")} formatter={(v, name) => [v, name]} />
        <Bar dataKey="credit" name="Sessions" radius={[4, 4, 0, 0]} maxBarSize={36}>
          {data.map((p) => <Cell key={p.from} fill={fill} fillOpacity={p.ended ? 1 : 0.45} />)}
        </Bar>
        <Line type="stepAfter" dataKey="target" name="Target" stroke="#0f172a" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** Completion rate by weekday — a comparison, so bars; thin data is greyed out. */
export function WeekdayChart({ weekdays, minObservations, height = 200 }) {
  const data = MONDAY_FIRST.map((d) => weekdays.find((w) => w.day === d)).filter(Boolean).map((w) => ({ ...w, label: w.name.slice(0, 3), enough: w.opportunities >= minObservations }));
  if (!data.some((d) => d.opportunities > 0)) return <EmptyNote>Nothing was scheduled in this period yet.</EmptyNote>;
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
          {grid}
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={pctTick} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v, _n, item) => [v === null ? "nothing scheduled" : `${Math.round(v)}% (${item.payload.completed} of ${item.payload.opportunities} scheduled)`, item.payload.name]} />
          <Bar dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {data.map((d) => <Cell key={d.day} fill={d.enough ? BRAND : MUTED} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-slate-500">Grey: fewer than {minObservations} scheduled items — too few to read as a pattern.</p>
    </div>
  );
}

/** Habits side by side for the period — a comparison, so horizontal bars. */
export function HabitComparisonChart({ habits }) {
  const data = habits.filter((h) => h.rate !== null).map((h) => ({ ...h, label: h.title.length > 22 ? `${h.title.slice(0, 21)}…` : h.title }));
  if (!data.length) return <EmptyNote>No habit has finished scheduled days or periods in this range yet.</EmptyNote>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 38 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={pctTick} tick={axis} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={120} tick={{ ...axis, fill: "#334155" }} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v, _n, item) => [item.payload.kind === "fixed" ? `${Math.round(v)}% (${item.payload.completed} of ${item.payload.total} scheduled days)` : `${Math.round(v)}% of target (${item.payload.completed} of ${item.payload.total} periods met)`, "Completion"]} />
        <Bar dataKey="rate" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((h) => <Cell key={h.habitId} fill={colorOf(h.color, HABIT)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** An amount per successive week/month (e.g. goal progress gained), as a line. */
export function AmountTrendChart({ buckets, valueKey, name, unit, suffix = "", color = BRAND, height = 220, detail }) {
  const data = buckets.map((b) => ({ ...b, label: unit === "month" ? monthName(b.from) : shortDay(b.from) }));
  if (!data.some((d) => (d[valueKey] ?? 0) > 0)) return <EmptyNote>Nothing recorded in these {unit === "month" ? "months" : "weeks"}.</EmptyNote>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(_, p) => (p?.[0] ? (unit === "month" ? monthName(p[0].payload.from) : `Week of ${shortDay(p[0].payload.from)}`) : "")}
          formatter={(v, _n, item) => [`${v}${suffix}${detail ? ` · ${detail(item.payload)}` : ""}`, name]}
        />
        <Line type="linear" dataKey={valueKey} name={name} stroke={color} strokeWidth={2.25} dot={{ r: 3, strokeWidth: 0, fill: color }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
