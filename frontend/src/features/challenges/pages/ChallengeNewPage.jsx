// /challenges/new — create a private challenge (only its creator sees and joins it).

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Field, IconButton, Input, Select, Textarea } from "../../../components/ui/index.js";
import { errorMessage, fieldErrors } from "../../../lib/errors.js";
import { challengesApi } from "../api/challenges.api.js";
import { CATEGORIES, DIFFICULTY_LABEL } from "../challenges.format.js";
import { PageHeader } from "./ChallengesPage.jsx";

const MAX_ACTIVITIES = 10;
const blankActivity = () => ({ id: crypto.randomUUID(), title: "", kind: "checkbox", target: "", unit: "", required: true, customizable: false });

function ChallengeNewPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ title: "", description: "", category: "custom", difficulty: "medium", durationDays: "30", strict: false });
  const [activities, setActivities] = useState([blankActivity()]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const setField = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };
  const setActivity = (id, patch) => setActivities((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  function validate() {
    const next = {};
    if (values.title.trim().length < 3) next.title = "Give it a title of at least 3 characters.";
    const days = Number(values.durationDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) next.durationDays = "Choose 1–365 days.";
    activities.forEach((a, i) => {
      if (!a.title.trim()) next[`a${i}`] = "Give this activity a name.";
      else if (a.kind === "numeric" && (!(Number(a.target) > 0) || !a.unit.trim())) next[`a${i}`] = "Numeric activities need a target above 0 and a unit.";
    });
    if (!activities.some((a) => a.required)) next.activities = "At least one activity must be required.";
    return next;
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const next = validate();
    if (Object.keys(next).length) return setErrors(next);
    setSaving(true);
    setError(null);
    try {
      const created = await challengesApi.createTemplate({
        ...values,
        durationDays: Number(values.durationDays),
        activities: activities.map(({ title, kind, target, unit, required, customizable }) => ({
          title: title.trim(),
          kind,
          ...(kind === "numeric" ? { target: Number(target), unit: unit.trim() } : {}),
          required,
          customizable: kind === "numeric" ? customizable : !required,
        })),
      });
      navigate(`/challenges/t/${created.id}`);
    } catch (err) {
      const byField = fieldErrors(err, ["title", "durationDays"]);
      if (Object.keys(byField).length) setErrors(byField);
      else setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Create a challenge" subtitle="Private to you — only you can see and join it" />
      <div className="flex-1 overflow-y-auto">
        <form onSubmit={submit} noValidate className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
          <Link to="/challenges" className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> All challenges
          </Link>
          {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
          <Field label="Title" htmlFor="ch-title" error={errors.title}>
            <Input id="ch-title" value={values.title} onChange={(e) => setField("title", e.target.value)} invalid={Boolean(errors.title)} placeholder="e.g. 21 days of Spanish" />
          </Field>
          <Field label="Description" htmlFor="ch-description">
            <Textarea id="ch-description" rows={2} value={values.description} onChange={(e) => setField("description", e.target.value)} />
          </Field>
          <Field label="Category" htmlFor="ch-category">
            <Select id="ch-category" value={values.category} onChange={(e) => setField("category", e.target.value)} options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} />
          </Field>
          <Field label="Difficulty" htmlFor="ch-difficulty">
            <Select id="ch-difficulty" value={values.difficulty} onChange={(e) => setField("difficulty", e.target.value)} options={Object.entries(DIFFICULTY_LABEL).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="Duration (days)" htmlFor="ch-days" error={errors.durationDays}>
            <Input id="ch-days" type="number" min="1" max="365" value={values.durationDays} onChange={(e) => setField("durationDays", e.target.value)} invalid={Boolean(errors.durationDays)} />
          </Field>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={values.strict} onChange={(e) => setField("strict", e.target.checked)} />
            Strict: a run only counts as a full completion if every required activity is done every day
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-slate-900">Daily activities</legend>
            {errors.activities && <p className="text-xs text-red-600">{errors.activities}</p>}
            {activities.map((a, i) => (
              <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <Input aria-label={`Activity ${i + 1} name`} placeholder="e.g. Practise vocabulary" value={a.title} onChange={(e) => setActivity(a.id, { title: e.target.value })} invalid={Boolean(errors[`a${i}`])} />
                  <IconButton icon={Trash2} label={`Remove activity ${i + 1}`} onClick={() => setActivities((list) => list.filter((x) => x.id !== a.id))} disabled={activities.length === 1} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <div className="w-36">
                    <Select aria-label={`Activity ${i + 1} type`} value={a.kind} onChange={(e) => setActivity(a.id, { kind: e.target.value })} options={[{ value: "checkbox", label: "Done / not done" }, { value: "numeric", label: "Amount" }]} />
                  </div>
                  {a.kind === "numeric" && (
                    <>
                      <div className="w-24"><Input type="number" min="0" step="any" aria-label={`Activity ${i + 1} target`} placeholder="Target" value={a.target} onChange={(e) => setActivity(a.id, { target: e.target.value })} /></div>
                      <div className="w-28"><Input aria-label={`Activity ${i + 1} unit`} placeholder="Unit, e.g. words" value={a.unit} onChange={(e) => setActivity(a.id, { unit: e.target.value })} /></div>
                    </>
                  )}
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={a.required} onChange={(e) => setActivity(a.id, { required: e.target.checked })} /> Required
                  </label>
                  {a.kind === "numeric" && (
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={a.customizable} onChange={(e) => setActivity(a.id, { customizable: e.target.checked })} /> Target adjustable
                    </label>
                  )}
                </div>
                {errors[`a${i}`] && <p className="text-xs text-red-600">{errors[`a${i}`]}</p>}
              </div>
            ))}
            <div>
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => setActivities((list) => [...list, blankActivity()])} disabled={activities.length >= MAX_ACTIVITIES}>
                Add activity
              </Button>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Link to="/challenges" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</Link>
            <Button type="submit" loading={saving}>Create challenge</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChallengeNewPage;
