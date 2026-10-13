// /habits/new and /habits/:habitId/edit — the guided wizard. Success is announced on the habit's
// page only after the server confirmed the save.

import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { ChevronLeft, Menu } from "lucide-react";
import { Alert, EmptyState, IconButton, Skeleton } from "../../../components/ui/index.js";
import { currentAppDateKey } from "../../../lib/date.js";
import { useGoals } from "../../goals/hooks/useGoals.js";
import { useTasks } from "../../tasks/hooks/useTasks.js";
import { habitsApi } from "../api/habits.api.js";
import { useHabit } from "../hooks/useHabits.js";
import { emptyHabitForm, formFromHabit } from "../habits.logic.js";
import HabitWizard from "../components/HabitWizard.jsx";

function Shell({ title, back, children }) {
  const { onOpenSidebar } = useOutletContext() ?? {};
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="lg:hidden" />
        <Link to={back} className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-800">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back
        </Link>
        <h1 className="ml-1 truncate text-lg font-semibold text-slate-900">{title}</h1>
      </div>
      <div className="flex-1 overflow-y-auto bg-slate-50/60">
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function NewHabit() {
  const navigate = useNavigate();
  const { lifeAreas } = useGoals();
  const { today, timeZone } = useTasks();
  const start = today ?? currentAppDateKey(timeZone);

  return (
    <Shell title="New habit" back="/habits">
      <HabitWizard
        key={start}
        initialValues={emptyHabitForm(start)}
        lifeAreas={lifeAreas}
        onCancel={() => navigate("/habits")}
        onSubmit={async (payload) => {
          const habit = await habitsApi.create(payload);
          navigate(`/habits/${habit.id}`, { replace: true, state: { flash: "Habit created — you can log today’s progress right away." } });
        }}
      />
    </Shell>
  );
}

function EditHabit({ habitId }) {
  const navigate = useNavigate();
  const { lifeAreas } = useGoals();
  const { habit, loading, error, notFound } = useHabit(habitId);

  return (
    <Shell title="Edit habit" back={`/habits/${habitId}`}>
      {loading && <Skeleton className="h-64 w-full rounded-xl" />}
      {!loading && notFound && <EmptyState title="Habit not found" description="It may belong to another account or the link is wrong." />}
      {!loading && error && !notFound && <Alert>{error}</Alert>}
      {habit && (
        <HabitWizard
          isEdit
          initialValues={formFromHabit(habit)}
          lifeAreas={lifeAreas}
          onCancel={() => navigate(`/habits/${habitId}`)}
          onSubmit={async (payload) => {
            await habitsApi.update(habitId, payload);
            navigate(`/habits/${habitId}`, { replace: true, state: { flash: "Changes saved." } });
          }}
        />
      )}
    </Shell>
  );
}

function HabitFormPage() {
  const { habitId } = useParams();
  return habitId ? <EditHabit habitId={habitId} /> : <NewHabit />;
}

export default HabitFormPage;
