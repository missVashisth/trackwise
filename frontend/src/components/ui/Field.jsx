import { cn } from "../../lib/cn.js";

/**
 * Griply-style form row: icon + label on the left, control on the right.
 * Falls back to stacked layout on small screens.
 */
function Field({ icon: Icon, label, hint, error, htmlFor, children, className }) {
  return (
    <div className={cn("grid gap-1.5 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-medium text-slate-700">
        {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}
        {label}
        {hint && <span className="sr-only">{hint}</span>}
      </label>
      <div className="min-w-0">
        {children}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export default Field;
