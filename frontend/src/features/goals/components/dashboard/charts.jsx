// Lightweight SVG charts for the goal dashboard (no chart dependency). Both draw at the real
// pixel width of their container so text and strokes stay crisp on every screen size.

import { useEffect, useRef, useState } from "react";
import { formatShortDate, MS_PER_DAY } from "../../../../lib/date.js";

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const dayIndex = (fromKey, dateKey) => Math.round((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / MS_PER_DAY);

const PAD = { top: 10, right: 12, bottom: 22, left: 34 };

/**
 * Cumulative goal progress per day (0–100), with the pace that doing every task every day
 * would give (each day is worth 100 / totalDays).
 */
export function CumulativeChart({ series, startDate, totalDays, colorHex, height = 200 }) {
  const [ref, width] = useElementWidth();
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = series.length;

  const x = (i) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (value) => PAD.top + innerH - (Math.min(100, value) / 100) * innerH;

  const actual = series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.cumulative).toFixed(1)}`).join(" ");
  const ideal = series
    .map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(((dayIndex(startDate, d.dateKey) + 1) * 100) / totalDays).toFixed(1)}`)
    .join(" ");
  const area = n > 1 ? `${actual} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : null;
  const last = series.at(-1);
  const labelIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];

  return (
    <div ref={ref} className="w-full">
      {width > 0 && n > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Overall progress from ${formatShortDate(series[0].dateKey)} to ${formatShortDate(last.dateKey)}: now ${last.cumulative}%.`}
        >
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#f1f5f9" />
              <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
                {tick}%
              </text>
            </g>
          ))}
          <path d={ideal} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />
          {area && <path d={area} fill={colorHex} opacity="0.1" />}
          {n > 1 && <path d={actual} fill="none" stroke={colorHex} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          <circle cx={x(n - 1)} cy={y(last.cumulative)} r="3.5" fill={colorHex} stroke="white" strokeWidth="1.5" />
          {labelIdx.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              className="fill-slate-400 text-[10px]"
            >
              {series[i].isToday ? "Today" : formatShortDate(series[i].dateKey)}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

const OUTCOME_LABEL = {
  full: "All tasks done",
  partial: "Partly done",
  none: "Nothing done",
  noTasks: "No tasks yet",
};

/** One bar per day: the share of that day's task weight that was completed. */
export function DailyBarChart({ days, colorHex, height = 160 }) {
  const [ref, width] = useElementWidth();
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = days.length;
  const slot = n ? innerW / n : 0;
  const barW = Math.max(3, Math.min(28, slot * 0.7));
  const y = (value) => PAD.top + innerH - (value / 100) * innerH;
  const labelEvery = n <= 14 ? 1 : Math.ceil(n / 7);

  const summary = `${days.filter((d) => d.outcome === "full").length} of ${n} days fully done, ${days.filter((d) => d.outcome === "partial").length} partly done, ${days.filter((d) => d.outcome === "none").length} with nothing done.`;

  return (
    <div ref={ref} className="w-full">
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Daily completion: ${summary}`}>
          {[0, 50, 100].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#f1f5f9" />
              <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">
                {tick}%
              </text>
            </g>
          ))}
          {days.map((day, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const unknown = day.completionPercent == null && day.outcome === "partial";
            const value = day.completionPercent ?? 0;
            const tooltip = `${formatShortDate(day.dateKey)}${day.isToday ? " (today, in progress)" : ""}: ${
              unknown ? "tasks done, progress record missing" : OUTCOME_LABEL[day.outcome]
            }${day.outcome === "full" || day.outcome === "partial" ? ` · ${day.tasksCompleted} done${unknown ? "" : ` · ${value}%`}` : ""}`;
            return (
              <g key={day.dateKey}>
                <title>{tooltip}</title>
                {/* full-height hit area so the tooltip works on short bars */}
                <rect x={cx - slot / 2} y={PAD.top} width={slot} height={innerH} fill="transparent" />
                {day.outcome === "noTasks" ? (
                  <circle cx={cx} cy={y(0) - 2} r="1.5" fill="#cbd5e1" />
                ) : unknown ? (
                  <rect x={cx - barW / 2} y={y(100)} width={barW} height={innerH} rx="3" fill="none" stroke={colorHex} strokeDasharray="3 3" />
                ) : value > 0 ? (
                  <rect
                    x={cx - barW / 2}
                    y={y(value)}
                    width={barW}
                    height={y(0) - y(value)}
                    rx="3"
                    fill={colorHex}
                    opacity={day.isToday ? 0.45 : day.outcome === "full" ? 1 : 0.6}
                  />
                ) : (
                  <rect x={cx - barW / 2} y={y(0) - 2} width={barW} height="2" rx="1" fill="#e2e8f0" />
                )}
                {(i % labelEvery === 0 || i === n - 1) && (
                  <text x={cx} y={height - 6} textAnchor="middle" className={day.isToday ? "fill-slate-700 text-[10px] font-medium" : "fill-slate-400 text-[10px]"}>
                    {day.isToday ? "Today" : Number(day.dateKey.slice(8))}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** A row of small squares, one per recent day: filled when the task was done that day. */
export function DayDots({ days, colorHex }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Done on ${days.filter((d) => d.done).length} of the last ${days.length} days`}>
      {days.map((day) => (
        <span
          key={day.dateKey}
          title={`${formatShortDate(day.dateKey)}: ${day.done ? "done" : "not done"}`}
          className="h-3 w-3 rounded-[3px]"
          style={{ backgroundColor: day.done ? colorHex : "#e2e8f0" }}
        />
      ))}
    </span>
  );
}

/**
 * Roadmap burn-up: tasks planned up to each day (dashed) vs. tasks actually completed by then.
 * The gap between the lines is work that is scheduled but not done yet.
 */
export function RoadmapProgressChart({ series, total, colorHex, height = 200 }) {
  const [ref, width] = useElementWidth();
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = series.length;
  const top = Math.max(1, total);

  const x = (i) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (value) => PAD.top + innerH - (Math.min(top, value) / top) * innerH;
  const line = (pick) => series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pick(d)).toFixed(1)}`).join(" ");
  const last = series.at(-1);
  const ticks = [...new Set([0, Math.round(top / 2), top])];
  const labelIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];

  return (
    <div ref={ref} className="w-full">
      {width > 0 && n > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Roadmap: ${last.done} of ${total} tasks done; ${last.planned} were planned up to ${last.isToday ? "today" : formatShortDate(last.dateKey)}.`}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#f1f5f9" />
              <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{tick}</text>
            </g>
          ))}
          <path d={line((d) => d.planned)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />
          {n > 1 && <path d={`${line((d) => d.done)} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`} fill={colorHex} opacity="0.1" />}
          {n > 1 && <path d={line((d) => d.done)} fill="none" stroke={colorHex} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          <circle cx={x(n - 1)} cy={y(last.done)} r="3.5" fill={colorHex} stroke="white" strokeWidth="1.5" />
          {labelIdx.map((i) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-slate-400 text-[10px]">
              {series[i].isToday ? "Today" : formatShortDate(series[i].dateKey)}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
