import { Bell, CheckCheck, Flag, ListChecks, PartyPopper, TrendingUp, Trophy } from "lucide-react";
import { Alert, Button, IconButton, Popover, Skeleton } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { useNotifications } from "../hooks/useNotifications.js";

const TYPE_ICON = {
  TASK_REMINDER: ListChecks,
  CHALLENGE_REMINDER: Trophy,
  CHALLENGE_WEEKLY: Trophy,
  CHALLENGE_ENDING: Trophy,
  CHALLENGE_FINISHED: Trophy,
  GOAL_COMPLETED: PartyPopper,
  PROGRESS_MILESTONE: TrendingUp,
};

function timeAgo(value, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function NotificationItem({ notification, onRead }) {
  const Icon = TYPE_ICON[notification.type] ?? Flag;
  const unread = !notification.readAt;
  return (
    <li>
      <button
        type="button"
        onClick={() => onRead(notification)}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50",
          unread && "bg-brand-50/50",
        )}
        aria-label={`${notification.title}${unread ? " (unread, click to mark as read)" : ""}`}
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm text-slate-900", unread ? "font-semibold" : "font-medium")}>
            {notification.title}
          </span>
          <span className="block text-xs leading-snug text-slate-600">{notification.message}</span>
          <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(notification.createdAt)}</span>
        </span>
        {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />}
      </button>
    </li>
  );
}

function NotificationBell() {
  const { unreadCount, items, hasMore, status, loadingMore, error, loadFirstPage, loadMore, markRead, markAllRead, clearError } =
    useNotifications();
  const badge = unreadCount > 99 ? "99+" : unreadCount;

  return (
    <Popover
      align="start"
      width="w-80"
      trigger={({ active, onClick, ...props }) => (
        <span className="relative">
          <IconButton
            icon={Bell}
            label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
            active={active}
            onClick={() => {
              if (!active) loadFirstPage();
              onClick();
            }}
            {...props}
          />
          {unreadCount > 0 && (
            <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
              {badge}
            </span>
          )}
        </span>
      )}
    >
      <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
        <p className="text-sm font-semibold text-slate-900">Notifications</p>
        <Button variant="ghost" size="sm" icon={CheckCheck} onClick={markAllRead} disabled={unreadCount === 0 || status !== "ready"}>
          Mark all read
        </Button>
      </div>

      {error && (
        <Alert className="mx-1 mb-1.5" onDismiss={clearError}>
          {error}
          {status === "error" && (
            <Button variant="ghost" size="sm" onClick={loadFirstPage} className="ml-1 underline">
              Retry
            </Button>
          )}
        </Alert>
      )}

      {status === "loading" && (
        <div className="flex flex-col gap-2 px-2 py-1" aria-label="Loading notifications">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <Bell className="mb-2 h-6 w-6 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-700">You're all caught up</p>
          <p className="text-xs text-slate-500">Reminders and goal updates will show up here.</p>
        </div>
      )}

      {status === "ready" && items.length > 0 && (
        <ul className="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
          {items.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} onRead={markRead} />
          ))}
          {hasMore && (
            <li className="pt-1">
              <Button variant="ghost" size="sm" onClick={loadMore} loading={loadingMore} className="w-full">
                Load older
              </Button>
            </li>
          )}
        </ul>
      )}
    </Popover>
  );
}

export default NotificationBell;
