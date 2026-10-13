import { CheckCircle2, Target } from "lucide-react";
import { cn } from "../../../lib/cn.js";

function GoalIcon({ colorHex, completed = false, size = "md" }) {
  const box = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white", box)}>
      {completed ? (
        <CheckCircle2 className={cn(icon, "text-green-600")} aria-hidden="true" />
      ) : (
        <Target className={cn(icon, "text-slate-600")} aria-hidden="true" />
      )}
      <span
        className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white"
        style={{ backgroundColor: colorHex }}
        aria-hidden="true"
      />
    </span>
  );
}

export default GoalIcon;
