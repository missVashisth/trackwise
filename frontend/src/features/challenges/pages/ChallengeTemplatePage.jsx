// /challenges/t/:templateId — what the challenge asks for, how many people are taking it, and joining.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AlertTriangle, ChevronLeft, Trophy, Users } from "lucide-react";
import { Alert, Button, EmptyState, Input, Skeleton } from "../../../components/ui/index.js";
import { currentAppDateKey, browserTimeZone } from "../../../lib/date.js";
import { errorMessage } from "../../../lib/errors.js";
import { challengesApi } from "../api/challenges.api.js";
import { useResource } from "../hooks/useResource.js";
import { DIFFICULTY_LABEL, STRICT_RULE, categoryLabel, plural, ruleKind, ruleText, scheduleLabel } from "../challenges.format.js";
import { PageHeader } from "./ChallengesPage.jsx";

const shift = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export function RuleList({ activities }) {
  return (
    <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
      {activities.map((a) => {
        const kind = ruleKind(a);
        return (
          <li key={a.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{ruleText(a)}</p>
              <p className="text-xs text-slate-500">
                {scheduleLabel(a.days)}
                {a.description ? ` · ${a.description}` : ""}
              </p>
            </div>
            <span className={`shrink-0 self-start rounded-full px-2 py-0.5 text-[11px] font-medium sm:self-center ${kind.tone}`}>{kind.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function JoinForm({ challenge, onJoined }) {
  const today = currentAppDateKey(browserTimeZone());
  const [start, setStart] = useState("today");
  const [customDate, setCustomDate] = useState(shift(today, 1));
  const [acknowledged, setAcknowledged] = useState(false);
  const [email, setEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function join(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const startDate = start === "today" ? undefined : start === "tomorrow" ? shift(today, 1) : customDate;
      const enrollment = await challengesApi.join(challenge.id, { startDate, acknowledgedStrictRule: acknowledged, reminders: { email } });
      onJoined(enrollment);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={join} aria-label="Join challenge" className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Join this challenge</h2>
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      <fieldset className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
        <legend className="mb-1 text-xs font-medium text-slate-500">Start</legend>
        {[["today", "Today"], ["tomorrow", "Tomorrow"], ["date", "On a date"]].map(([value, label]) => (
          <label key={value} className="inline-flex items-center gap-1.5">
            <input type="radio" name="start" value={value} checked={start === value} onChange={() => setStart(value)} />
            {label}
          </label>
        ))}
        {start === "date" && (
          <div className="w-40">
            <Input type="date" aria-label="Start date" min={today} max={shift(today, 30)} value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
          </div>
        )}
      </fieldset>
      <label className="inline-flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5" checked={email} onChange={(e) => setEmail(e.target.checked)} />
        Also email me reminders and weekly reports (in-app reminders are on; you can change both later)
      </label>
      {challenge.strict && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {STRICT_RULE}
          </p>
          <label className="mt-2 inline-flex items-center gap-2 font-medium">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            I understand the strict rule
          </label>
        </div>
      )}
      <div>
        <Button type="submit" loading={saving} disabled={challenge.strict && !acknowledged}>
          Join challenge
        </Button>
      </div>
    </form>
  );
}

function ChallengeTemplatePage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const resource = useResource(() => challengesApi.getTemplate(templateId), templateId);
  const challenge = resource.data;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={challenge?.title ?? "Challenge"} subtitle={challenge ? `${categoryLabel(challenge.category)} · ${plural(challenge.durationDays, "day")}` : null} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
          <Link to="/challenges" className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> All challenges
          </Link>
          {resource.loading && !challenge && <Skeleton className="h-64 w-full rounded-2xl" />}
          {resource.notFound && (
            <EmptyState icon={Trophy} title="Challenge not found" description="It may have been removed, or it belongs to someone else." action={<Link to="/challenges" className="text-sm font-medium text-brand-700 hover:underline">Back to challenges</Link>} />
          )}
          {resource.error && !resource.notFound && (
            <Alert>
              {resource.error}{" "}
              <Button variant="ghost" size="sm" onClick={resource.reload} className="ml-1 underline">Retry</Button>
            </Alert>
          )}
          {challenge && (
            <>
              <section className="flex flex-col gap-2">
                <p className="text-sm leading-relaxed text-slate-700">{challenge.description}</p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{DIFFICULTY_LABEL[challenge.difficulty]}</span>
                  <span>{plural(challenge.ruleCount, "daily activity", "daily activities")}, {challenge.requiredCount} required</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {challenge.participants === 0 ? "No one is taking it right now" : `${plural(challenge.participants, "person is", "people are")} taking this challenge`}
                  </span>
                </p>
              </section>
              <section aria-labelledby="rules-title" className="flex flex-col gap-2">
                <h2 id="rules-title" className="text-sm font-semibold text-slate-900">Daily activities</h2>
                <RuleList activities={challenge.activities} />
                <p className="text-xs text-slate-500">
                  When you join, these rules are copied to your own challenge. Later changes to this template never change a challenge you're already taking.
                </p>
              </section>
              {challenge.myEnrollmentId ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  You're taking this challenge.
                  <Link to={`/challenges/my/${challenge.myEnrollmentId}`} className="font-semibold underline">Open my challenge</Link>
                </div>
              ) : (
                <JoinForm challenge={challenge} onJoined={(enrollment) => navigate(`/challenges/my/${enrollment.id}`)} />
              )}
              {challenge.myAttempts.length > 0 && (
                <section aria-labelledby="attempts-title">
                  <h2 id="attempts-title" className="mb-2 text-sm font-semibold text-slate-900">Your attempts</h2>
                  <ul className="flex flex-col gap-1 text-sm">
                    {challenge.myAttempts.map((a) => (
                      <li key={a.id}>
                        <Link to={`/challenges/my/${a.id}`} className="text-brand-700 hover:underline">
                          Attempt {a.attempt}: {a.startDate} – {a.endDate} ({a.status === "active" ? "in progress" : a.status})
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChallengeTemplatePage;
