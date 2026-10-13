// /challenges — Discover (catalogue, by category) and My challenges (?tab=mine).

import { Link, useOutletContext, useSearchParams } from "react-router";
import { CalendarDays, CheckCircle2, ListChecks, Menu, Plus, Trophy, Users } from "lucide-react";
import { Alert, Button, EmptyState, IconButton, Skeleton } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { challengesApi } from "../api/challenges.api.js";
import { useResource } from "../hooks/useResource.js";
import { CATEGORIES, DIFFICULTY_LABEL, PHASE_LABEL, categoryLabel, plural } from "../challenges.format.js";

const TABS = [
  { id: "discover", label: "Discover" },
  { id: "mine", label: "My challenges" },
];

export function PageHeader({ title, subtitle, actions }) {
  const { onOpenSidebar } = useOutletContext() ?? {};
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="lg:hidden" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

function LoadError({ error, onRetry }) {
  return (
    <Alert>
      {error}{" "}
      <Button variant="ghost" size="sm" onClick={onRetry} className="ml-1 underline">Retry</Button>
    </Alert>
  );
}

function ChallengeCard({ challenge }) {
  return (
    <li className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{challenge.title}</h3>
        {challenge.myEnrollmentId && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Joined
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{challenge.description}</p>
      <dl className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <div className="inline-flex items-center gap-1"><dt className="sr-only">Duration</dt><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /><dd>{plural(challenge.durationDays, "day")}</dd></div>
        <div className="inline-flex items-center gap-1"><dt className="sr-only">Daily activities</dt><ListChecks className="h-3.5 w-3.5" aria-hidden="true" /><dd>{plural(challenge.ruleCount, "daily activity", "daily activities")}</dd></div>
        <div className="inline-flex items-center gap-1"><dt className="sr-only">Participants</dt><Users className="h-3.5 w-3.5" aria-hidden="true" /><dd>{plural(challenge.participants, "participant")}</dd></div>
      </dl>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{categoryLabel(challenge.category)}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{DIFFICULTY_LABEL[challenge.difficulty]}</span>
        {challenge.strict && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Strict</span>}
        {challenge.mine && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">Your challenge · private</span>}
      </div>
      <div className="mt-auto flex gap-2 pt-4">
        {challenge.myEnrollmentId ? (
          <Link to={`/challenges/my/${challenge.myEnrollmentId}`} className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
            Open my challenge
          </Link>
        ) : (
          <Link to={`/challenges/t/${challenge.id}`} className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700" aria-label={`View details and join ${challenge.title}`}>
            View details &amp; join
          </Link>
        )}
      </div>
    </li>
  );
}

function Discover({ category, setCategory }) {
  const catalogue = useResource(() => challengesApi.list(category), category ?? "all");
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div role="group" aria-label="Category" className="flex gap-1.5 overflow-x-auto pb-1">
        {[{ id: null, label: "All" }, ...CATEGORIES].map((c) => (
          <button
            key={c.id ?? "all"}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
            className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-medium", category === c.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
          >
            {c.label}
          </button>
        ))}
      </div>
      {catalogue.error && <LoadError error={catalogue.error} onRetry={catalogue.reload} />}
      {catalogue.loading && !catalogue.data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      )}
      {catalogue.data && catalogue.data.length === 0 && (
        <EmptyState icon={Trophy} title="No challenges here yet" description={category === "custom" ? "Create your own challenge with the rules that suit you." : "Try another category."} />
      )}
      {catalogue.data && catalogue.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{catalogue.data.map((c) => <ChallengeCard key={c.id} challenge={c} />)}</ul>
      )}
    </div>
  );
}

function EnrollmentRow({ e }) {
  const s = e.summary ?? {};
  const progress = e.phase === "running" ? `Day ${s.currentDay} of ${e.durationDays}` : e.phase === "upcoming" ? `Starts ${e.startDate}` : PHASE_LABEL[e.phase];
  return (
    <li>
      <Link to={`/challenges/my/${e.id}`} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 hover:bg-slate-50 sm:px-5">
        <Trophy className={cn("h-5 w-5 shrink-0", e.phase === "running" ? "text-amber-500" : "text-slate-300")} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {e.title}
            {e.attempt > 1 && <span className="ml-1.5 text-xs font-normal text-slate-500">attempt {e.attempt}</span>}
          </p>
          <p className="truncate text-xs text-slate-500">
            {progress}
            {s.requiredAdherence !== null && s.requiredAdherence !== undefined && ` · ${s.requiredAdherence}% of required activities done`}
            {e.phase === "running" && s.today && ` · today ${s.today.requiredMet} of ${s.today.requiredTotal} required`}
          </p>
        </div>
        {e.phase === "running" && e.participants > 1 && (
          <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{plural(e.participants - 1, "other participant")}</span>
        )}
      </Link>
    </li>
  );
}

function Mine() {
  const mine = useResource(() => challengesApi.mine(), "mine");
  const enrollments = mine.data?.enrollments ?? [];
  const current = enrollments.filter((e) => e.phase === "running" || e.phase === "upcoming");
  const past = enrollments.filter((e) => !current.includes(e));
  return (
    <div className="flex flex-col">
      {mine.error && <div className="p-4 sm:p-5"><LoadError error={mine.error} onRetry={mine.reload} /></div>}
      {mine.loading && !mine.data && <div className="p-5"><Skeleton className="h-16 w-full" /></div>}
      {mine.data && enrollments.length === 0 && (
        <EmptyState icon={Trophy} title="You haven't joined a challenge yet" description="Pick one from Discover, or create your own." />
      )}
      {current.length > 0 && (
        <section aria-label="Current challenges">
          <h2 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Current</h2>
          <ul>{current.map((e) => <EnrollmentRow key={e.id} e={e} />)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section aria-label="Past challenges">
          <h2 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">Finished &amp; left</h2>
          <ul>{past.map((e) => <EnrollmentRow key={e.id} e={e} />)}</ul>
        </section>
      )}
    </div>
  );
}

function ChallengesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "mine" ? "mine" : "discover";
  const category = CATEGORIES.some((c) => c.id === params.get("category")) ? params.get("category") : null;
  const setTab = (id) => setParams(id === "mine" ? { tab: "mine" } : {}, { replace: true });
  const setCategory = (id) => setParams(id ? { category: id } : {}, { replace: true });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Challenges"
        subtitle="Daily rules, tracked one day at a time"
        actions={
          <Link to="/challenges/new" aria-label="Create a challenge" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Create a challenge</span>
          </Link>
        }
      />
      <nav aria-label="Challenge sections" className="flex gap-1 border-b border-slate-100 px-4 sm:px-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto">{tab === "mine" ? <Mine /> : <Discover category={category} setCategory={setCategory} />}</div>
    </div>
  );
}

export default ChallengesPage;
