import { ChevronDown, HelpCircle, LogOut, Search, Star, X } from "lucide-react";
import { IconButton, MenuItem, Popover, ProgressRing } from "../components/ui/index.js";
import { useAuth } from "../features/auth/hooks/useAuth.js";
import { useGoals } from "../features/goals/hooks/useGoals.js";
import { getGoalColorHex, getProgress } from "../features/goals/goals.selectors.js";
import { formatRelativeDeadline } from "../lib/date.js";
import { cn } from "../lib/cn.js";
import { NAV_SECTIONS } from "../app.navigation.js";
import SidebarItem from "./SidebarItem.jsx";
import SidebarSection from "./SidebarSection.jsx";
import NotificationBell from "../features/notifications/components/NotificationBell.jsx";

function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const displayName = user?.username || user?.email?.split("@")[0] || "Guest";
  const { favorites, lifeAreaById } = useGoals();

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn("fixed inset-0 z-30 bg-slate-900/30 transition lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-100 px-3 py-4 transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Primary"
      >
        {/* User menu */}
        <div className="mb-4 flex items-center justify-between px-1">
          <Popover
            align="start"
            width="w-48"
            // `active` is for IconButton-style triggers; a plain <button> must not receive it.
            trigger={({ active: _active, ...props }) => (
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-200/60"
                {...props}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold uppercase text-white">
                  {displayName.slice(0, 1)}
                </span>
                {displayName}
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              </button>
            )}
          >
            <MenuItem icon={LogOut} onSelect={logout}>{user ? "Log out" : "Log in"}</MenuItem>
          </Popover>
          <div className="flex items-center gap-1">
            <NotificationBell />
            {/* <IconButton icon={Search} label="Search" /> */}
            {/* <IconButton icon={X} label="Close navigation" onClick={onClose} className="lg:hidden" /> */}
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <SidebarSection key={section.id} title={section.title}>
              {section.items.map((item) => (
                <SidebarItem key={item.to} {...item} onNavigate={onClose} />
              ))}
            </SidebarSection>
          ))}

          {favorites.length > 0 && (
            <SidebarSection title="Favorites">
              {favorites.map((goal) => {
                const relative = formatRelativeDeadline(goal.deadline);
                return (
                  <SidebarItem
                    key={goal.id}
                    to={`/goals#goal-${goal.id}`}
                    label={goal.title}
                    leading={<ProgressRing value={getProgress(goal)} size={16} color={getGoalColorHex(goal, lifeAreaById.get(goal.lifeAreaId))} />}
                    trailing={relative?.label}
                    onNavigate={onClose}
                  />
                );
              })}
            </SidebarSection>
          )}
        </nav>

        <div className="mt-4 flex items-center justify-between px-1">
          <IconButton icon={HelpCircle} label="Help" />
          {/* <IconButton icon={Star} label="Favorites" /> */}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
