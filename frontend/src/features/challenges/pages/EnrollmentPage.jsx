// /challenges/my/:enrollmentId — one attempt: Today's checklist, Progress (report), Settings.
// The section is in the URL (?view=progress|settings) so refresh and links keep it.

import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ChevronLeft, Trophy, Users } from "lucide-react";
import { Alert, Button, EmptyState, Skeleton } from "../../../components/ui/index.js";
import { SubTabs } from "../../insights/components/InsightParts.jsx";
import { challengesApi } from "../api/challenges.api.js";
import { useResource } from "../hooks/useResource.js";
import { PHASE_LABEL, plural } from "../challenges.format.js";
import DayChecklist from "../components/DayChecklist.jsx";
import ChallengeReport from "../components/ChallengeReport.jsx";
import ChallengeSettings from "../components/ChallengeSettings.jsx";
import { PageHeader } from "./ChallengesPage.jsx";

const VIEWS = [
  { id: "today", label: "Daily checklist" },
  { id: "progress", label: "Progress" },
  { id: "settings", label: "Settings" },
];

const dayMonth = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function EnrollmentPage() {
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.id === params.get("view")) ? params.get("view") : "today";
  const setView = (id) => setParams(id === "today" ? {} : { view: id }, { replace: true });
  const resource = useResource(() => challengesApi.getEnrollment(enrollmentId), enrollmentId);
  const e = resource.data;
  const s = e?.summary;

  const subtitle = e
    ? e.phase === "running"
      ? `Day ${s.currentDay} of ${e.durationDays} · ${dayMonth(e.startDate)} – ${dayMonth(e.endDate)}`
      : `${PHASE_LABEL[e.phase]} · ${dayMonth(e.startDate)} – ${dayMonth(e.endDate)}`
    : null;
  const others = e ? Math.max(0, e.participants - (e.status === "active" ? 1 : 0)) : 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={e?.title ?? "Challenge"} subtitle={subtitle} />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-4 pt-3 sm:px-5">
          <Link to="/challenges?tab=mine" className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> My challenges
          </Link>
          {resource.loading && !e && <Skeleton className="h-40 w-full rounded-2xl" />}
          {resource.notFound && (
            <EmptyState icon={Trophy} title="Challenge not found" description="It may belong to another account, or the link is wrong." action={<Link to="/challenges?tab=mine" className="text-sm font-medium text-brand-700 hover:underline">Back to my challenges</Link>} />
          )}
          {resource.error && !resource.notFound && (
            <Alert>{resource.error} <Button variant="ghost" size="sm" onClick={resource.reload} className="ml-1 underline">Retry</Button></Alert>
          )}
          {e && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                {e.phase === "running" && s.today && (
                  <span>Today: <strong>{s.today.requiredMet} of {s.today.requiredTotal}</strong> required done</span>
                )}
                {s.requiredAdherence !== null && <span>{s.requiredAdherence}% of required activities done so far</span>}
                {e.phase === "running" && <span>{plural(s.daysRemaining, "day")} left</span>}
                {e.status === "active" && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {others === 0 ? "You're the only one taking it right now" : `${plural(others, "other person is", "other people are")} taking this challenge with you`}
                  </span>
                )}
                {e.attempt > 1 && <span>Attempt {e.attempt}</span>}
              </div>
              <SubTabs label="Challenge sections" tabs={VIEWS} active={view} onChange={setView} />
            </>
          )}
        </div>
        {e && (
          <div role="tabpanel" aria-labelledby={`subtab-${view}`}>
            {view === "today" && <DayChecklist key={e.id} enrollment={e} onChanged={resource.reload} />}
            {view === "progress" && <ChallengeReport enrollment={e} />}
            {view === "settings" && (
              <ChallengeSettings
                key={`${e.id}-${e.status}`}
                enrollment={e}
                onSaved={resource.setData}
                onLeft={() => resource.reload()}
                onRestarted={(next) => navigate(`/challenges/my/${next.id}`)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default EnrollmentPage;
