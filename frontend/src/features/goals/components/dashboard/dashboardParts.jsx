// Small presentational pieces shared by the goal dashboard tabs.

import { cn } from "../../../../lib/cn.js";
import { GOAL_STATUS } from "./dashboard.utils.js";

export function StatusBadge({ status }) {
  const meta = GOAL_STATUS[status] ?? GOAL_STATUS.active;
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", meta.className)}>
      {meta.label}
    </span>
  );
}

export function Card({ title, description, action, children, className, bodyClassName }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-xs", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A compact metric: label, big value, supporting line. */
export function Stat({ label, value, detail, children }) {
  return (
    <Card bodyClassName="flex items-center gap-4">
      {children}
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <div className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">{value}</div>
        {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
      </div>
    </Card>
  );
}

export function ProgressBar({ value, colorHex, marker, label, className }) {
  const clamped = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn("relative h-2 w-full rounded-full bg-slate-100", className)}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${clamped}%`, backgroundColor: colorHex }} />
      {marker != null && (
        <span
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-slate-500"
          style={{ left: `calc(${Math.min(100, Math.max(0, marker))}% - 1px)` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
