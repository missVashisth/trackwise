import { NavLink } from "react-router";
import { cn } from "../lib/cn.js";

function SidebarItem({ to, label, icon: Icon, leading, trailing, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition",
          isActive ? "bg-slate-200/70 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900",
        )
      }
    >
      {leading ?? (Icon && <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />)}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing && <span className="shrink-0 text-xs text-slate-400">{trailing}</span>}
    </NavLink>
  );
}

export default SidebarItem;
