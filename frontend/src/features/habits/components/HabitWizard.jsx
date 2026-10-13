// Guided habit setup: Basics -> Schedule -> Tracking -> Milestones -> Review.
// Each step validates before moving on; the final button saves once (repeat clicks are ignored
// while the request runs) and reports success only after the server confirms.

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Field, IconButton, Input, Select, Textarea } from "../../../components/ui/index.js";
import { cn } from "../../../lib/cn.js";
import { formatLongDate } from "../../../lib/date.js";
import { GOAL_COLORS } from "../../goals/goals.constants.js";
import {
  HABIT_STEPS,
  SCHEDULE_OPTIONS,
  TRACKING_OPTIONS,
  UNIT_SUGGESTIONS,
  WEEKDAYS,
  firstInvalidStep,
  formatNumber,
  scheduleLabel,
  toHabitPayload,
  trackingLabel,
  validateStep,
} from "../habits.logic.js";
import HabitIcon from "./HabitIcon.jsx";
import { HABIT_ICONS } from "../habitIcons.js";
import { errorMessage } from "../../../lib/errors.js";

function StepIndicator({ current, onJump, maxReached }) {
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Steps">
      {HABIT_STEPS.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li key={step.id} className="flex flex-1 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => onJump(index)}
              disabled={index > maxReached}
              aria-current={state === "current" ? "step" : undefined}
              className="flex min-w-0 items-center gap-1.5 disabled:cursor-default"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  state === "done" && "bg-brand-600 text-white",
                  state === "current" && "bg-brand-50 text-brand-700 ring-2 ring-brand-500",
                  state === "todo" && "bg-slate-100 text-slate-500",
                )}
              >
                {state === "done" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span className={cn("hidden truncate text-xs font-medium sm:inline", state === "current" ? "text-slate-900" : "text-slate-500")}>{step.label}</span>
            </button>
            {index < HABIT_STEPS.length - 1 && <span className={cn("h-px flex-1", index < current ? "bg-brand-500" : "bg-slate-200")} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceCards({ name, options, value, onChange, disabled }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            name={name}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-60",
              selected ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

const Question = ({ children }) => <h2 className="text-base font-semibold text-slate-900">{children}</h2>;

function BasicsStep({ values, set, errors, lifeAreas }) {
  return (
    <div className="flex flex-col gap-4">
      <Question>What habit do you want to build?</Question>
      <Field label="Habit name" htmlFor="habit-title" error={errors.title}>
        <Input id="habit-title" autoFocus value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Reading, Exercise, Learning JavaScript" invalid={Boolean(errors.title)} maxLength={120} />
      </Field>
      <Field label="Why it matters" htmlFor="habit-motivation" error={errors.motivation}>
        <Textarea id="habit-motivation" rows={2} value={values.motivation} onChange={(e) => set("motivation", e.target.value)} placeholder="Optional — what will this habit give you?" maxLength={500} />
      </Field>
      <Field label="What counts as success" htmlFor="habit-description" error={errors.description}>
        <Textarea id="habit-description" rows={2} value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional — e.g. read at least one chapter before bed" maxLength={1000} />
      </Field>
      {lifeAreas.length > 0 && (
        <Field label="Category" htmlFor="habit-area">
          <Select id="habit-area" value={values.lifeAreaId} onChange={(e) => set("lifeAreaId", e.target.value)} placeholder="No category" options={lifeAreas.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` }))} />
        </Field>
      )}
      <Field label="Icon">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
          {Object.keys(HABIT_ICONS).map((key) => (
            <button key={key} type="button" role="radio" aria-checked={values.icon === key} aria-label={key} onClick={() => set("icon", values.icon === key ? "" : key)} className={cn("rounded-xl", values.icon === key && "ring-2 ring-brand-500 ring-offset-1")}>
              <HabitIcon icon={key} color={values.color} size="sm" />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Colour">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
          {GOAL_COLORS.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={values.color === c.value} aria-label={c.label} onClick={() => set("color", values.color === c.value ? "" : c.value)} className={cn("h-6 w-6 rounded-full", values.color === c.value && "ring-2 ring-slate-900 ring-offset-2")} style={{ backgroundColor: c.hex }} />
          ))}
        </div>
      </Field>
    </div>
  );
}

function ScheduleStep({ values, set, errors }) {
  const toggleDay = (day) => set("weekdays", values.weekdays.includes(day) ? values.weekdays.filter((d) => d !== day) : [...values.weekdays, day]);
  const flexible = values.scheduleType === "timesPerWeek" || values.scheduleType === "timesPerMonth";
  return (
    <div className="flex flex-col gap-4">
      <Question>How often do you want to do it?</Question>
      <ChoiceCards name="schedule" options={SCHEDULE_OPTIONS} value={values.scheduleType} onChange={(v) => set("scheduleType", v)} />

      {values.scheduleType === "weekdays" && (
        <Field label="On these days" error={errors.weekdays}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdays">
            {WEEKDAYS.map((day) => {
              const on = values.weekdays.includes(day.value);
              return (
                <button key={day.value} type="button" aria-pressed={on} aria-label={day.long} onClick={() => toggleDay(day.value)} className={cn("h-9 w-11 rounded-lg text-sm font-medium", on ? "bg-brand-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
                  {day.short}
                </button>
              );
            })}
          </div>
        </Field>
      )}
      {flexible && (
        <Field label={values.scheduleType === "timesPerWeek" ? "Times per week" : "Times per month"} htmlFor="habit-times" error={errors.timesPerPeriod}>
          <div className="flex items-center gap-2">
            <Input id="habit-times" type="number" min="1" max={values.scheduleType === "timesPerWeek" ? 7 : 31} value={values.timesPerPeriod} onChange={(e) => set("timesPerPeriod", e.target.value)} className="w-24" invalid={Boolean(errors.timesPerPeriod)} />
            <span className="text-xs text-slate-500">on any days {values.scheduleType === "timesPerWeek" ? "of the week (Mon–Sun)" : "of the month"}</span>
          </div>
        </Field>
      )}
      <Field label="Start date" htmlFor="habit-start" error={errors.startDate}>
        <Input id="habit-start" type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} invalid={Boolean(errors.startDate)} />
      </Field>
      <Field label="End date" htmlFor="habit-end" error={errors.endDate}>
        <Input id="habit-end" type="date" min={values.startDate || undefined} value={values.endDate} onChange={(e) => set("endDate", e.target.value)} invalid={Boolean(errors.endDate)} aria-describedby="habit-end-hint" />
        <p id="habit-end-hint" className="mt-1 text-xs text-slate-500">Optional — leave empty to keep going.</p>
      </Field>
    </div>
  );
}

function TrackingStep({ values, set, errors, isEdit }) {
  return (
    <div className="flex flex-col gap-4">
      <Question>How will you track it?</Question>
      <ChoiceCards name="tracking" options={TRACKING_OPTIONS} value={values.trackingMethod} onChange={(v) => set("trackingMethod", v)} />
      {isEdit && <p className="text-xs text-slate-500">The tracking method can only change while no progress has been logged.</p>}
      {values.trackingMethod === "measurable" && (
        <Field label="Daily target" htmlFor="habit-target" error={errors.targetValue || errors.unit}>
          <div className="flex flex-wrap items-center gap-2">
            <Input id="habit-target" type="number" min="0" step="any" value={values.targetValue} onChange={(e) => set("targetValue", e.target.value)} placeholder="30" className="w-24" invalid={Boolean(errors.targetValue)} />
            <Input value={values.unit} onChange={(e) => set("unit", e.target.value)} list="habit-units" aria-label="Unit" placeholder="minutes" className="w-36" invalid={Boolean(errors.unit)} maxLength={20} />
            <datalist id="habit-units">
              {UNIT_SUGGESTIONS.map((u) => <option key={u} value={u} />)}
            </datalist>
          </div>
          <p className="mt-1 text-xs text-slate-500">Logging 20 of 30 {values.unit || "minutes"} counts as 67% for that day.</p>
        </Field>
      )}
      {values.trackingMethod === "percentage" && <p className="text-sm text-slate-600">Each day you’ll enter how much you did, from 0 to 100%. Partial days still count.</p>}
      {values.trackingMethod === "checkbox" && <p className="text-sm text-slate-600">Each day you’ll simply mark it done.</p>}
    </div>
  );
}

function MilestonesStep({ values, set, errors }) {
  const update = (index, field, value) => set("milestones", values.milestones.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  const add = () => set("milestones", [...values.milestones, { title: "", description: "", targetValue: "", targetDate: "" }]);
  const remove = (index) => set("milestones", values.milestones.filter((_, i) => i !== index));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Question>Any milestones along the way?</Question>
        <p className="mt-0.5 text-sm text-slate-500">Optional checkpoints like “read the first 50 pages”. You mark them reached yourself — they’re separate from daily progress.</p>
      </div>
      {values.milestones.map((m, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-start gap-2">
            <div className="grid flex-1 gap-2">
              <Input value={m.title} onChange={(e) => update(i, "title", e.target.value)} placeholder="Milestone title" aria-label={`Milestone ${i + 1} title`} invalid={Boolean(errors[`milestone-${i}-title`])} maxLength={120} />
              {errors[`milestone-${i}-title`] && <p className="text-xs text-red-600">{errors[`milestone-${i}-title`]}</p>}
              <Input value={m.description} onChange={(e) => update(i, "description", e.target.value)} placeholder="Description (optional)" aria-label={`Milestone ${i + 1} description`} maxLength={500} />
              <div className="flex flex-wrap gap-2">
                <Input type="number" min="0" step="any" value={m.targetValue} onChange={(e) => update(i, "targetValue", e.target.value)} placeholder={`Target${values.trackingMethod === "measurable" ? ` (${values.unit})` : ""}`} aria-label={`Milestone ${i + 1} target`} className="w-40" invalid={Boolean(errors[`milestone-${i}-targetValue`])} />
                <Input type="date" min={values.startDate || undefined} max={values.endDate || undefined} value={m.targetDate} onChange={(e) => update(i, "targetDate", e.target.value)} aria-label={`Milestone ${i + 1} target date`} className="w-44" invalid={Boolean(errors[`milestone-${i}-targetDate`])} />
              </div>
              {(errors[`milestone-${i}-targetValue`] || errors[`milestone-${i}-targetDate`]) && (
                <p className="text-xs text-red-600">{errors[`milestone-${i}-targetValue`] ?? errors[`milestone-${i}-targetDate`]}</p>
              )}
            </div>
            <IconButton icon={Trash2} label={`Remove milestone ${i + 1}`} onClick={() => remove(i)} />
          </div>
        </div>
      ))}
      {values.milestones.length < 20 && (
        <Button variant="secondary" icon={Plus} onClick={add} className="w-fit">Add a milestone</Button>
      )}
    </div>
  );
}

function ReviewStep({ values, lifeAreas }) {
  const payload = toHabitPayload(values);
  const area = lifeAreas.find((a) => a.id === values.lifeAreaId);
  const rows = [
    ["Schedule", scheduleLabel(payload.schedule)],
    ["Dates", `From ${formatLongDate(payload.startDate)}${payload.endDate ? ` to ${formatLongDate(payload.endDate)}` : ", no end date"}`],
    ["Tracking", trackingLabel(payload)],
    ["Category", area ? `${area.emoji} ${area.name}` : "None"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <Question>Ready to start?</Question>
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
        <HabitIcon icon={payload.icon} color={payload.color} size="lg" />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-slate-900">{payload.title}</p>
          {payload.motivation && <p className="text-sm text-slate-600">{payload.motivation}</p>}
          {payload.description && <p className="mt-1 text-xs text-slate-500">Success: {payload.description}</p>}
        </div>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Milestones</h3>
        {payload.milestones.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">None — you can add some later.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {payload.milestones.map((m, i) => (
              <li key={i} className="text-slate-800">
                {m.title}
                {m.targetValue != null && <span className="text-slate-500"> · {formatNumber(m.targetValue)}{payload.unit ? ` ${payload.unit}` : ""}</span>}
                {m.targetDate && <span className="text-slate-500"> · by {formatLongDate(m.targetDate)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * initialValues: form values (emptyHabitForm / formFromHabit). onSubmit(payload) saves and resolves
 * with the saved habit; it may throw (the message is shown and the user can retry).
 */
function HabitWizard({ initialValues, lifeAreas, isEdit = false, onSubmit, onCancel }) {
  const [values, setValues] = useState(initialValues);
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(isEdit ? HABIT_STEPS.length - 1 : 0);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const inFlight = useRef(false);

  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };
  const goTo = (index) => {
    setErrors({});
    setStep(index);
    setMaxReached((m) => Math.max(m, index));
  };

  function next() {
    const stepErrors = validateStep(HABIT_STEPS[step].id, values);
    if (Object.keys(stepErrors).length) return setErrors(stepErrors);
    goTo(step + 1);
  }

  async function submit() {
    if (inFlight.current) return; // a second click while saving does nothing
    const invalid = firstInvalidStep(values);
    if (invalid) {
      setStep(HABIT_STEPS.findIndex((s) => s.id === invalid.stepId));
      setErrors(invalid.errors);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(toHabitPayload(values));
    } catch (err) {
      setSubmitError(errorMessage(err));
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const stepId = HABIT_STEPS[step].id;
  const last = step === HABIT_STEPS.length - 1;
  const props = { values, set, errors, lifeAreas, isEdit };

  return (
    <div className="flex flex-col gap-5">
      <StepIndicator current={step} maxReached={maxReached} onJump={(index) => index <= maxReached && goTo(index)} />
      {submitError && <Alert onDismiss={() => setSubmitError(null)}>{submitError}</Alert>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (last) submit();
          else next();
        }}
        className="flex flex-col gap-5"
        noValidate
      >
        {stepId === "basics" && <BasicsStep {...props} />}
        {stepId === "schedule" && <ScheduleStep {...props} />}
        {stepId === "tracking" && <TrackingStep {...props} />}
        {stepId === "milestones" && <MilestonesStep {...props} />}
        {stepId === "review" && <ReviewStep {...props} />}

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
          {step === 0 ? (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
          ) : (
            <Button variant="secondary" icon={ArrowLeft} onClick={() => goTo(step - 1)} disabled={submitting}>Back</Button>
          )}
          {last ? (
            <Button type="submit" icon={Check} loading={submitting}>{isEdit ? "Save changes" : "Start tracking"}</Button>
          ) : (
            <Button type="submit">
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export default HabitWizard;
