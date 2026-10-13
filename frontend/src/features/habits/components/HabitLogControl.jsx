// Enter or update one day's progress. The value replaces that day's entry (never adds to it);
// the server computes and stores the percentage.

import { useState } from "react";
import { Check, StickyNote } from "lucide-react";
import { Alert, Button, Input, Textarea } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { formatNumber, previewPercent } from "../habits.logic.js";
import { errorMessage } from "../../../lib/errors.js";

function initialValues(habit, log) {
  return {
    progressPercent: log ? String(log.progressPercent) : "",
    actualValue: log?.actualValue != null ? String(log.actualValue) : "",
    note: log?.note ?? "",
  };
}

/**
 * habit: the habit; log: the day's saved entry or null; onSave(entry) and onClear() return promises.
 * compact: one-line quick logger (habit list); otherwise with a note field (detail page).
 */
function HabitLogControl({ habit, log, onSave, onClear, compact = false, disabled = false }) {
  const [values, setValues] = useState(() => initialValues(habit, log));
  const [showNote, setShowNote] = useState(Boolean(log?.note));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const savedKey = `${log?.progressPercent ?? ""}|${log?.actualValue ?? ""}|${log?.note ?? ""}`;
  const [lastSavedKey, setLastSavedKey] = useState(savedKey);
  if (savedKey !== lastSavedKey) {
    // The saved entry changed (another save or a reload): show it.
    setLastSavedKey(savedKey);
    setValues(initialValues(habit, log));
  }

  async function run(action) {
    if (saving) return; // one request at a time
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const note = compact ? {} : { note: values.note.trim() };

  if (habit.trackingMethod === "checkbox") {
    const done = log?.progressPercent >= 100;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={done ? "secondary" : "primary"}
            icon={Check}
            loading={saving}
            disabled={disabled}
            onClick={() => run(() => (done ? onClear() : onSave({ completed: true, ...note })))}
            aria-pressed={done}
          >
            {done ? "Done — undo" : "Mark done"}
          </Button>
          {!compact && log && !done && <span className="text-xs text-slate-500">Logged as not done</span>}
        </div>
        {!compact && done && <NoteField values={values} setValues={setValues} onSave={() => run(() => onSave({ completed: true, note: values.note.trim() }))} saving={saving} />}
        {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
      </div>
    );
  }

  const isPercent = habit.trackingMethod === "percentage";
  const field = isPercent ? "progressPercent" : "actualValue";
  const preview = previewPercent(habit, values);
  const valid = preview !== null && values[field] !== "";

  function submit(event) {
    event.preventDefault();
    if (!valid) return;
    run(() => onSave({ [field]: Number(values[field]), ...note }));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className={cn("flex flex-wrap items-center gap-2", compact && "flex-nowrap")}>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            max={isPercent ? 100 : undefined}
            step="any"
            value={values[field]}
            onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
            aria-label={isPercent ? "Progress in percent" : `Amount done (${habit.unit})`}
            placeholder={isPercent ? "0–100" : "0"}
            className={compact ? "h-8 w-20 py-1" : "w-28"}
            disabled={disabled}
          />
          <span className="text-sm text-slate-500">{isPercent ? "%" : `/ ${formatNumber(habit.targetValue)} ${habit.unit}`}</span>
        </div>
        <Button type="submit" size="sm" loading={saving} disabled={disabled || !valid}>
          {log ? "Update" : "Save"}
        </Button>
        {!compact && log && (
          <Button size="sm" variant="ghost" onClick={() => run(onClear)} disabled={saving || disabled}>
            Clear
          </Button>
        )}
        {!isPercent && preview !== null && values[field] !== "" && (
          <span className="text-xs text-slate-500">= {formatNumber(preview)}%</span>
        )}
      </div>
      {isPercent && values[field] !== "" && preview === null && <p className="text-xs text-red-600">Use a number from 0 to 100.</p>}
      {!compact && (showNote ? (
        <Textarea rows={2} value={values.note} onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))} placeholder="Note (optional)" maxLength={500} aria-label="Note" />
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="inline-flex w-fit items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
          <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
          Add a note
        </button>
      ))}
      {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
    </form>
  );
}

function NoteField({ values, setValues, onSave, saving }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea rows={2} value={values.note} onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))} placeholder="Note (optional)" maxLength={500} aria-label="Note" />
      <Button size="sm" variant="secondary" className="w-fit" onClick={onSave} loading={saving}>Save note</Button>
    </div>
  );
}

export default HabitLogControl;
