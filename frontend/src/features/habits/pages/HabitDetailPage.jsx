import { useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router";
import { Archive, ArchiveRestore, ChevronLeft, Flag, Menu, Pencil, Repeat } from "lucide-react";
import { Alert, Button, EmptyState, IconButton, Skeleton } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { formatLongDate, formatShortDate } from "../../../lib/date.js";
import { Card, ProgressBar } from "../../goals/components/dashboard/dashboardParts.jsx";
import { COLOR_HEX } from "../../goals/goals.constants.js";
import { habitsApi } from "../api/habits.api.js";
import { useHabit } from "../hooks/useHabits.js";
import { DAY_STATUS, formatNumber, periodLabel, scheduleLabel, trackingLabel } from "../habits.logic.js";
import HabitHistory from "../components/HabitHistory.jsx";
import HabitIcon from "../components/HabitIcon.jsx";
import HabitLogControl from "../components/HabitLogControl.jsx";
import { errorMessage } from "../../../lib/errors.js";

function Milestones({ habit, onToggle, busyId }) {
  if (!habit.milestones.length) {
    return <p className="text-sm text-slate-500">No milestones. You can add some by editing the habit.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {habit.milestones.map((m) => (
        <li key={m.id} className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={Boolean(m.completedAt)}
            disabled={busyId === m.id || habit.isArchived}
            onChange={() => onToggle(m)}
            aria-label={m.completedAt ? `Mark “${m.title}” as not reached` : `Mark “${m.title}” as reached`}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <div className="min-w-0 text-sm">
            <p className={cn("font-medium text-slate-800", m.completedAt && "text-slate-400 line-through")}>{m.title}</p>
            <p className="text-xs text-slate-500">
              {[m.description, m.targetValue != null && `${formatNumber(m.targetValue)} ${m.targetUnit || habit.unit}`.trim(), m.targetDate && `by ${formatShortDate(m.targetDate)}`, m.completedAt && `reached ${formatShortDate(m.completedAt)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function HabitDetailPage() {
  const { habitId } = useParams();
  const { onOpenSidebar } = useOutletContext() ?? {};
  const location = useLocation();
  const navigate = useNavigate();
  const { habit, history, today, loading, error, notFound, reload, setHabit } = useHabit(habitId);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(null);
  const flash = location.state?.flash;

  async function act(key, fn) {
    if (busy) return;
    setBusy(key);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (notFound || (!habit && error)) {
    return (
      <EmptyState
        icon={Repeat}
        title={notFound ? "Habit not found" : "Couldn’t load this habit"}
        description={notFound ? "It may belong to another account or the link is wrong." : error}
        action={<Link to="/habits" className="text-sm font-medium text-brand-700 hover:underline">Back to habits</Link>}
      />
    );
  }

  const todayLog = habit.today.log;
  const hex = COLOR_HEX[habit.color] ?? "#4f46e5";
  // Logging refreshes the habit at once and the history in the background.
  const afterLog = (updated) => {
    setHabit(updated);
    reload();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="-ml-1.5 lg:hidden" />
          <Link to="/habits" className="inline-flex items-center gap-0.5 font-medium hover:text-slate-800">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Habits
          </Link>
        </div>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <HabitIcon icon={habit.icon} color={habit.color} size="lg" />
            <div className="min-w-0">
              <h1 className="break-words text-xl font-semibold tracking-tight text-slate-900">
                {habit.title}
                {habit.isArchived && <span className="ml-2 align-middle text-xs font-medium text-slate-500">Archived</span>}
              </h1>
              <p className="text-sm text-slate-500">
                {scheduleLabel(habit.schedule)} · {trackingLabel(habit)} · since {formatLongDate(habit.startDate)}
                {habit.endDate && ` until ${formatLongDate(habit.endDate)}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => navigate(`/habits/${habit.id}/edit`)}>Edit</Button>
            {habit.isArchived ? (
              <Button variant="secondary" size="sm" icon={ArchiveRestore} loading={busy === "archive"} onClick={() => act("archive", async () => setHabit(await habitsApi.restore(habit.id)))}>Restore</Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon={Archive}
                loading={busy === "archive"}
                onClick={() => window.confirm(`Archive “${habit.title}”? Its history is kept and you can restore it later.`) && act("archive", async () => setHabit(await habitsApi.archive(habit.id)))}
              >
                Archive
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50/60">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-5">
          {flash && <Alert tone="info" onDismiss={() => navigate(location.pathname, { replace: true, state: null })}>{flash}</Alert>}
          {actionError && <Alert onDismiss={() => setActionError(null)}>{actionError}</Alert>}

          <div className="grid gap-4 lg:grid-cols-5">
            <Card
              className="lg:col-span-3"
              title={`Today · ${formatShortDate(today)}`}
              description={
                habit.today.requirement === "rest"
                  ? "Not a scheduled day — you can still log it."
                  : habit.today.requirement === "flexible"
                    ? "Any day counts toward this period’s target."
                    : undefined
              }
            >
              {habit.today.requirement === "outside" ? (
                <p className="text-sm text-slate-500">{today < habit.startDate ? `This habit starts on ${formatLongDate(habit.startDate)}.` : "This habit has ended."}</p>
              ) : habit.isArchived ? (
                <p className="text-sm text-slate-500">Restore this habit to log progress.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <ProgressBar value={todayLog?.progressPercent ?? 0} colorHex={todayLog?.progressPercent >= 100 ? "#16a34a" : hex} label="Today's progress" />
                    <span className="w-28 shrink-0 text-right text-sm font-semibold text-slate-900">
                      {todayLog ? `${formatNumber(todayLog.progressPercent)}%` : DAY_STATUS.pending.label}
                    </span>
                  </div>
                  <HabitLogControl
                    habit={habit}
                    log={todayLog}
                    onSave={async (entry) => afterLog((await habitsApi.log(habit.id, today, entry)).habit)}
                    onClear={async () => afterLog(await habitsApi.clearLog(habit.id, today))}
                  />
                </div>
              )}
            </Card>

            <Card className="lg:col-span-2" title={habit.period.type === "month" ? "This month" : "This week"}>
              <p className="text-lg font-semibold text-slate-900">{periodLabel(habit)}</p>
              {habit.period.target != null ? (
                <div className="mt-2">
                  <ProgressBar value={(habit.period.credit / habit.period.target) * 100} colorHex={hex} label="Progress toward this period's target" />
                  <p className="mt-1.5 text-xs text-slate-500">Partial days count partly (e.g. 50% = half a session).</p>
                </div>
              ) : (
                habit.period.averagePercent != null && <p className="mt-1 text-xs text-slate-500">Average {formatNumber(habit.period.averagePercent)}% on scheduled days so far.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3" title="Last 30 days" description="Missed means a scheduled day that ended without a log; rest days aren’t counted.">
              {history ? <HabitHistory days={history.days} color={habit.color} unit={habit.unit} /> : <Skeleton className="h-24 w-full" />}
            </Card>
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card title="Milestones" action={<Flag className="h-4 w-4 text-slate-400" aria-hidden="true" />}>
                <Milestones habit={habit} busyId={busy} onToggle={(m) => act(m.id, async () => setHabit(await habitsApi.setMilestone(habit.id, m.id, !m.completedAt)))} />
              </Card>
              {(habit.motivation || habit.description) && (
                <Card title="Why and what counts">
                  {habit.motivation && <p className="text-sm text-slate-700">{habit.motivation}</p>}
                  {habit.description && <p className="mt-2 text-xs text-slate-500">Success: {habit.description}</p>}
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HabitDetailPage;
