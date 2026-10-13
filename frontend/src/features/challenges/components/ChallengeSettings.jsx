// Personal settings for one enrollment: only what the rules allow (adjustable targets, optional
// activities on/off) plus reminders. Leaving and restarting live here, behind a confirmation.

import { useState } from "react";
import { Lock } from "lucide-react";
import { Alert, Button, Input, Toggle } from "../../../components/ui/index.js";
import { errorMessage } from "../../../lib/errors.js";
import { challengesApi } from "../api/challenges.api.js";
import { formatAmount, scheduleLabel } from "../challenges.format.js";

function ChallengeSettings({ enrollment, onSaved, onLeft, onRestarted }) {
  const running = enrollment.status === "active";
  const [targets, setTargets] = useState(() => Object.fromEntries(enrollment.activities.map((a) => [a.key, a.target ?? ""])));
  const [enabled, setEnabled] = useState(() => Object.fromEntries(enrollment.activities.map((a) => [a.key, a.enabled])));
  const [reminders, setReminders] = useState(enrollment.reminders);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const activities = [];
    for (const a of enrollment.activities) {
      const change = { key: a.key };
      if (a.customizable && a.kind === "numeric" && Number(targets[a.key]) !== a.target) {
        if (!(Number(targets[a.key]) > 0)) return setError(`Set a target above 0 for “${a.title}”.`);
        change.target = Number(targets[a.key]);
      }
      if (!a.required && enabled[a.key] !== a.enabled) change.enabled = enabled[a.key];
      if (Object.keys(change).length > 1) activities.push(change);
    }
    setBusy("save");
    setError(null);
    setSaved(false);
    try {
      onSaved(await challengesApi.updateSettings(enrollment.id, { activities, reminders }));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function act(kind) {
    const message =
      kind === "leave"
        ? "Leave this challenge? Your progress so far is kept in your history, but you won't be able to log more days for this attempt."
        : "Restart this challenge? This attempt ends (and stays in your history) and a new attempt starts today with day 1.";
    if (!window.confirm(message)) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "leave") onLeft(await challengesApi.leave(enrollment.id));
      else onRestarted(await challengesApi.restart(enrollment.id));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-5">
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      {saved && <Alert tone="info" onDismiss={() => setSaved(false)}>Your settings were saved.</Alert>}
      <form onSubmit={save} className="flex flex-col gap-5">
        <section aria-labelledby="personal-rules" className="flex flex-col gap-2">
          <h2 id="personal-rules" className="text-sm font-semibold text-slate-900">Your activities</h2>
          <p className="text-xs text-slate-500">Changes apply to your own challenge only — never to the shared challenge or other participants. Past days keep the target that applied then.</p>
          <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
            {enrollment.activities.map((a) => (
              <li key={a.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{a.title}</p>
                  <p className="text-xs text-slate-500">{a.required ? "Required" : "Optional"} · {scheduleLabel(a.days)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {a.kind === "numeric" &&
                    (a.customizable && running ? (
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        Target
                        <span className="w-20">
                          <Input type="number" min="0" step="any" aria-label={`${a.title} target (${a.unit})`} value={targets[a.key]} onChange={(e) => setTargets((t) => ({ ...t, [a.key]: e.target.value }))} />
                        </span>
                        {a.unit}
                      </label>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500" title="Fixed by the challenge">
                        <Lock className="h-3 w-3" aria-hidden="true" /> {formatAmount(a.target)} {a.unit}
                      </span>
                    ))}
                  {!a.required && running && (
                    <span className="flex items-center gap-2 text-xs text-slate-600">
                      <Toggle checked={enabled[a.key]} onChange={(v) => setEnabled((e) => ({ ...e, [a.key]: v }))} label={`Track “${a.title}”`} />
                      Track
                    </span>
                  )}
                  {a.required && !a.customizable && a.kind === "checkbox" && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock className="h-3 w-3" aria-hidden="true" /> Fixed</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="reminders-title" className="flex flex-col gap-2">
          <h2 id="reminders-title" className="text-sm font-semibold text-slate-900">Reminders</h2>
          {[
            ["daily", "Evening reminder when required activities are still open"],
            ["weekly", "Weekly report at the end of each challenge week"],
            ["email", "Also send these by email"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm text-slate-700">
              <Toggle checked={reminders[key]} onChange={(v) => setReminders((r) => ({ ...r, [key]: v }))} label={label} />
              {label}
            </label>
          ))}
        </section>
        {running && (
          <div>
            <Button type="submit" loading={busy === "save"} disabled={Boolean(busy)}>Save settings</Button>
          </div>
        )}
      </form>
      {running && (
        <section aria-labelledby="danger-title" className="flex flex-col gap-2 rounded-xl border border-red-200 p-4">
          <h2 id="danger-title" className="text-sm font-semibold text-red-700">Leave or restart</h2>
          <p className="text-xs text-slate-600">Your logged days stay in your history either way.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => act("restart")} loading={busy === "restart"} disabled={Boolean(busy)}>Restart from day 1</Button>
            <Button variant="danger" onClick={() => act("leave")} loading={busy === "leave"} disabled={Boolean(busy)}>Leave challenge</Button>
          </div>
        </section>
      )}
    </div>
  );
}

export default ChallengeSettings;
