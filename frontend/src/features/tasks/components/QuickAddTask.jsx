// Inline "add task" form for Upcoming: title, day, priority and (optionally) a roadmap goal.
// Keeps what was typed when saving fails; the submit button is disabled while a save is running.

import { useMemo, useState } from "react";
import { Alert, Button, Input, Select } from "../../../components/ui/index.js";
import { errorMessage, fieldErrors } from "../../../lib/errors.js";
import { goalsAcceptingDatedTasks } from "../upcoming.selectors.js";
import { PRIORITY_OPTIONS } from "../tasks.constants.js";

function QuickAddTask({ defaultDate, goals, onSubmit, onCancel }) {
  const [values, setValues] = useState({ title: "", date: defaultDate, priority: "", goalId: "" });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);

  const goalOptions = useMemo(() => goalsAcceptingDatedTasks(goals, values.date), [goals, values.date]);
  const goalId = goalOptions.some((g) => g.id === values.goalId) ? values.goalId : "";

  const setField = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const next = {};
    if (!values.title.trim()) next.title = "Give the task a name.";
    else if (values.title.trim().length > 200) next.title = "Keep the name under 200 characters.";
    if (!values.date) next.date = "Pick a day.";
    if (Object.keys(next).length) return setErrors(next);

    setSaving(true);
    setSubmitError(null);
    try {
      await onSubmit(
        goalId
          ? { goalId, kind: "roadmap", title: values.title.trim(), scheduledDate: values.date }
          : { goalId: null, title: values.title.trim(), dueDate: values.date, priority: values.priority || null },
      );
      // Ready for the next one on the same day.
      setValues((v) => ({ ...v, title: "" }));
    } catch (err) {
      const byField = fieldErrors(err, ["title", "dueDate", "scheduledDate", "priority"]);
      if (byField.dueDate || byField.scheduledDate) byField.date = byField.dueDate ?? byField.scheduledDate;
      if (Object.keys(byField).length) setErrors(byField);
      else setSubmitError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Add task" className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {submitError && <Alert onDismiss={() => setSubmitError(null)}>{submitError}</Alert>}
      <div>
        <Input
          autoFocus
          aria-label="Task name"
          placeholder="Task name, e.g. Call the dentist"
          value={values.title}
          onChange={(e) => setField("title", e.target.value)}
          invalid={Boolean(errors.title)}
        />
        {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <div className="w-40">
          <Input type="date" aria-label="Day" value={values.date} onChange={(e) => setField("date", e.target.value)} invalid={Boolean(errors.date)} />
          {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date}</p>}
        </div>
        {!goalId && (
          <div className="w-36">
            <Select aria-label="Priority" value={values.priority} onChange={(e) => setField("priority", e.target.value)} options={PRIORITY_OPTIONS} />
          </div>
        )}
        {goalOptions.length > 0 && (
          <div className="min-w-44 flex-1">
            <Select
              aria-label="Goal"
              value={goalId}
              onChange={(e) => setField("goalId", e.target.value)}
              options={[{ value: "", label: "No goal (to-do)" }, ...goalOptions.map((g) => ({ value: g.id, label: `Roadmap: ${g.title}` }))]}
            />
          </div>
        )}
      </div>
      {goalOptions.length === 0 && (
        <p className="text-xs text-slate-500">Saved as a to-do. Dated tasks can join a goal that has a roadmap covering that day.</p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" loading={saving}>Add task</Button>
      </div>
    </form>
  );
}

export default QuickAddTask;
