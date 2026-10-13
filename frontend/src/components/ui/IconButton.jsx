import { cn } from "../../lib/cn.js";

function IconButton({ icon: Icon, label, size = "md", active = false, className, ...rest }) {
  const dimension = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        active && "bg-brand-50 text-brand-700",
        dimension,
        className,
      )}
      {...rest}
    >
      <Icon className={iconSize} aria-hidden="true" />
    </button>
  );
}

export default IconButton;
