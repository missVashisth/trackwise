import { X } from "lucide-react";
import { cn } from "../../lib/cn.js";

function Alert({ tone = "error", children, onDismiss, className }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm",
        tone === "error" && "border-red-200 bg-red-50 text-red-700",
        tone === "info" && "border-brand-200 bg-brand-50 text-brand-800",
        className,
      )}
    >
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default Alert;
