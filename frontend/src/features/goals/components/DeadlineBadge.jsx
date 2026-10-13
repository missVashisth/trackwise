import { Flag } from "lucide-react";
import { formatLongDate, formatRelativeDeadline } from "../../../lib/date.js";
import { cn } from "../../../lib/cn.js";

const TONE_CLASS = {
  neutral: "text-slate-600",
  warning: "text-orange-600",
  danger: "text-red-600",
};

function DeadlineBadge({ deadline }) {
  const relative = formatRelativeDeadline(deadline);
  if (!relative) return <span className="text-sm text-slate-300">—</span>;

  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", TONE_CLASS[relative.tone])} title={formatLongDate(deadline)}>
      <Flag className={cn("h-3.5 w-3.5", relative.tone !== "neutral" && "fill-current")} aria-hidden="true" />
      {relative.label}
    </span>
  );
}

export default DeadlineBadge;
