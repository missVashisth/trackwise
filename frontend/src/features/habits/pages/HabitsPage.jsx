import { useState } from "react";
import { Link, useOutletContext } from "react-router";
import { Menu, Plus, Repeat } from "lucide-react";
import { Alert, Button, EmptyState, IconButton, Skeleton } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { habitsApi } from "../api/habits.api.js";
import { useHabitList } from "../hooks/useHabits.js";
import HabitCard from "../components/HabitCard.jsx";

function HabitsPage() {
  const { onOpenSidebar } = useOutletContext() ?? {};
  const [status, setStatus] = useState("active");
  const { habits, today, loading, error, reload, replace } = useHabitList(status);

  const logToday = async (habit, entry) => replace((await habitsApi.log(habit.id, today, entry)).habit);
  const clearToday = async (habit) => replace(await habitsApi.clearLog(habit.id, today));

  const doneToday = habits.filter((h) => h.today.log?.progressPercent >= 100).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="lg:hidden" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900">Habits</h1>
            <p className="truncate text-xs text-slate-500">
              {loading ? "Loading your habits…" : status === "active" ? `${habits.length} active · ${doneToday} done today` : `${habits.length} archived`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-lg border border-slate-200 p-0.5 sm:inline-flex" role="group" aria-label="Show">
            {["active", "archived"].map((value) => (
              <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium capitalize", status === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>
                {value}
              </button>
            ))}
          </div>
          <Link to="/habits/new" aria-label="New habit">
            <Button icon={Plus} tabIndex={-1} aria-hidden="true">
              <span className="hidden sm:inline">New habit</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-5">
          {error && (
            <Alert>
              Couldn’t load your habits. {error}{" "}
              <Button variant="ghost" size="sm" onClick={reload} className="ml-1 underline">Retry</Button>
            </Alert>
          )}
          {loading && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          )}
          {!loading && !error && habits.length === 0 && (
            <EmptyState
              icon={Repeat}
              title={status === "active" ? "No habits yet" : "No archived habits"}
              description={status === "active" ? "Build a habit step by step: what it is, how often, and how you’ll track it." : "Archived habits keep their history and can be restored."}
              action={status === "active" && <Link to="/habits/new"><Button icon={Plus} tabIndex={-1}>Create your first habit</Button></Link>}
            />
          )}
          {!loading && habits.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {habits.map((habit) => <HabitCard key={habit.id} habit={habit} onLog={logToday} onClear={clearToday} />)}
            </div>
          )}
          <button type="button" onClick={() => setStatus(status === "active" ? "archived" : "active")} className="text-xs font-medium text-slate-500 hover:text-slate-800 sm:hidden">
            {status === "active" ? "Show archived habits" : "Show active habits"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HabitsPage;
