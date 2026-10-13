// One day's activities for an enrollment. Each activity saves on its own; saving replaces that
// day's record (never adds to it). Future days can't be edited; rest days aren't expected.

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, Button, IconButton, Input, Skeleton } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { errorMessage } from "../../../lib/errors.js";
import { challengesApi } from "../api/challenges.api.js";
import { useResource } from "../hooks/useResource.js";
import { formatAmount, ruleKind, scheduleLabel } from "../challenges.format.js";

const shift = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const longDay = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayNumber = (start, key) => Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;

const STATUS = {
  done: { label: "Done", tone: "text-green-700" },
  open: { label: "Not done yet", tone: "text-slate-500" },
  missed: { label: "Missed", tone: "text-red-600" },
  rest: { label: "Rest day", tone: "text-slate-400" },
  future: { label: "Upcoming", tone: "text-slate-400" },
};

function NumericInput({ activity, disabled, saving, onSave }) {
  // Remounted (via key) whenever the saved value changes, so it always starts from the server's value.
  const [value, setValue] = useState(activity.value ?? "");
  const changed = String(value) !== String(activity.value ?? "");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && value !== "") onSave({ value: Number(value) });
      }}
    >
      <div className="w-24">
        <Input type="number" inputMode="decimal" min="0" step="any" aria-label={`${activity.title} (${activity.unit})`} value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} />
      </div>
      <span className="text-xs text-slate-500">/ {formatAmount(activity.target)} {activity.unit}</span>
      <Button type="submit" size="sm" variant="secondary" disabled={disabled || !changed || value === ""} loading={saving}>
        Save
      </Button>
    </form>
  );
}

function ActivityRow({ activity, editable, saving, onSave }) {
  const status = STATUS[activity.status] ?? STATUS.open;
  const off = !activity.enabled;
  const disabled = !editable || !activity.scheduled || off || saving;
  return (
    <li className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {activity.kind === "checkbox" && (
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
            checked={activity.done}
            disabled={disabled}
            aria-busy={saving || undefined}
            aria-label={activity.done ? `Mark “${activity.title}” as not done` : `Mark “${activity.title}” as done`}
            onChange={() => onSave({ done: !activity.done })}
          />
        )}
        <div className="min-w-0">
          <p className={cn("text-sm font-medium text-slate-900", off && "text-slate-400 line-through")}>{activity.title}</p>
          <p className="text-xs text-slate-500">
            <span className={ruleKind(activity).tone.replace(/bg-\S+/, "")}>{activity.required ? "Required" : "Optional"}</span>
            {" · "}
            {scheduleLabel(activity.days)}
            {" · "}
            <span className={status.tone}>{off ? "Switched off" : status.label}</span>
          </p>
        </div>
      </div>
      {activity.kind === "numeric" && activity.scheduled && !off && (
        <div className="flex flex-col gap-1 sm:items-end">
          <NumericInput key={`${activity.key}:${activity.value}`} activity={activity} disabled={disabled} saving={saving} onSave={onSave} />
          <div className="h-1.5 w-full rounded-full bg-slate-100 sm:w-48" role="progressbar" aria-label={`${activity.title} progress`} aria-valuenow={Math.round(activity.progressPercent)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${activity.progressPercent}%` }} />
          </div>
        </div>
      )}
    </li>
  );
}

function DayChecklist({ enrollment, onChanged }) {
  const today = enrollment.today;
  const lastEditable = today < enrollment.endDate ? today : enrollment.endDate;
  const [date, setDate] = useState(today < enrollment.startDate ? enrollment.startDate : lastEditable);
  const day = useResource(() => challengesApi.getDay(enrollment.id, date), `${enrollment.id}:${date}`);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [announcement, setAnnouncement] = useState("");

  async function save(activity, body) {
    if (saving) return;
    setSaving(activity.key);
    setError(null);
    try {
      const result = await challengesApi.log(enrollment.id, date, activity.key, body);
      day.setData(result.day);
      setAnnouncement(`${activity.title} saved.`);
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  if (today < enrollment.startDate) {
    return <p className="p-5 text-sm text-slate-600">This challenge starts on {longDay(enrollment.startDate)}. Your first activities will appear here that day.</p>;
  }

  return (
    <section aria-label="Daily checklist">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 sm:px-5">
        <IconButton icon={ChevronLeft} label="Previous day" onClick={() => setDate(shift(date, -1))} disabled={date <= enrollment.startDate} />
        <div className="text-center">
          <h2 className="text-sm font-semibold text-slate-900">{date === today ? "Today" : longDay(date)}</h2>
          <p className="text-xs text-slate-500">Day {dayNumber(enrollment.startDate, date)} of {enrollment.durationDays}</p>
        </div>
        <div className="flex items-center gap-1">
          {date !== lastEditable && <Button size="sm" variant="ghost" onClick={() => setDate(lastEditable)}>{lastEditable === today ? "Today" : "Last day"}</Button>}
          <IconButton icon={ChevronRight} label="Next day" onClick={() => setDate(shift(date, 1))} disabled={date >= lastEditable} />
        </div>
      </div>
      {error && <div className="px-4 pt-3 sm:px-5"><Alert onDismiss={() => setError(null)}>{error}</Alert></div>}
      {day.error && (
        <div className="px-4 pt-3 sm:px-5">
          <Alert>{day.error} <Button variant="ghost" size="sm" onClick={day.reload} className="ml-1 underline">Retry</Button></Alert>
        </div>
      )}
      {day.loading && !day.data && <div className="p-5"><Skeleton className="h-24 w-full" /></div>}
      {day.data && (
        <>
          {!day.data.editable && <p className="px-4 pt-3 text-xs text-slate-500 sm:px-5">This challenge can no longer be updated.</p>}
          <ul>
            {day.data.activities.map((activity) => (
              <ActivityRow key={activity.key} activity={activity} editable={day.data.editable} saving={saving === activity.key} onSave={(body) => save(activity, body)} />
            ))}
          </ul>
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </section>
  );
}

export default DayChecklist;
