import { useState } from "react";
import { BarChart3, Calendar, CalendarRange, Compass, Flag, ListChecks, Palette, Star, Target, Zap } from "lucide-react";
import { Alert, Button, Field, Input, Modal, Select, Toggle } from "../../../components/ui/index.js";
import { GOAL_COLORS, IMPACT_OPTIONS, METRIC_BY_TYPE, METRIC_TYPES } from "../goals.constants.js";
import { useGoalForm } from "../hooks/useGoalForm.js";
import GoalTasksEditor from "../../tasks/components/GoalTasksEditor.jsx";

function GoalForm({ goal, defaults, lifeAreas, onSubmit, onCancel }) {
  const [draftTasks, setDraftTasks] = useState([]);
  const { values, errors, submitting, submitError, setField, handleSubmit } = useGoalForm({
    goal,
    defaults,
    onSubmit: (payload) => onSubmit(payload, draftTasks),
  });
  const metricMeta = METRIC_BY_TYPE[values.metricType];
  const isEdit = Boolean(goal);

  return (
    <form id="goal-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
      {submitError && <Alert>{submitError}</Alert>}

      {/* Title block, mirrors Griply's icon + name + description header */}
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
          <Target className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            autoFocus
            value={values.title}
            onChange={(e) => setField("title", e.target.value)}
            placeholder="Goal name"
            aria-label="Goal name"
            aria-invalid={Boolean(errors.title)}
            className="w-full border-0 bg-transparent p-0 text-lg font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          {errors.title && <p className="text-xs text-red-600">{errors.title}</p>}
          <textarea
            value={values.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Description"
            aria-label="Description"
            rows={2}
            className="w-full resize-none bg-transparent p-0 text-sm text-slate-600 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <Field icon={Compass} label="Contributes to" htmlFor="goal-life-area">
          <Select
            id="goal-life-area"
            value={values.lifeAreaId}
            onChange={(e) => setField("lifeAreaId", e.target.value)}
            placeholder="Select life area"
            options={lifeAreas.map((area) => ({ value: area.id, label: `${area.emoji} ${area.name}` }))}
          />
        </Field>
        <Field icon={Zap} label="Impact" htmlFor="goal-impact">
          <Select id="goal-impact" value={values.impact} onChange={(e) => setField("impact", e.target.value)} options={IMPACT_OPTIONS} />
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <Field icon={Calendar} label="Start date" htmlFor="goal-start" error={errors.startDate}>
          <Input id="goal-start" type="date" value={values.startDate} onChange={(e) => setField("startDate", e.target.value)} invalid={Boolean(errors.startDate)} />
        </Field>
        <Field icon={Flag} label="Deadline" htmlFor="goal-deadline" error={errors.deadline}>
          <Input id="goal-deadline" type="date" value={values.deadline} min={values.startDate} onChange={(e) => setField("deadline", e.target.value)} invalid={Boolean(errors.deadline)} />
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <Field icon={CalendarRange} label="Duration" htmlFor="goal-total-days" error={errors.totalDays}>
          <div className="flex items-center gap-2">
            <Input
              id="goal-total-days"
              type="number"
              min="1"
              step="1"
              value={values.totalDays}
              onChange={(e) => setField("totalDays", e.target.value)}
              placeholder="e.g. 30"
              invalid={Boolean(errors.totalDays)}
            />
            <span className="shrink-0 text-sm text-slate-500">days</span>
          </div>
        </Field>
        <Field icon={BarChart3} label="Success metric" htmlFor="goal-metric">
          <Select
            id="goal-metric"
            value={values.metricType}
            onChange={(e) => setField("metricType", e.target.value)}
            options={METRIC_TYPES.map((m) => ({ value: m.value, label: `${m.label} · ${m.hint}` }))}
          />
        </Field>
        <Field label={isEdit ? "Current / Target" : "Target"} error={errors.metricTarget || errors.metricCurrent}>
          <div className="flex items-center gap-2">
            {isEdit && (
              <>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={values.metricCurrent}
                  onChange={(e) => setField("metricCurrent", e.target.value)}
                  aria-label="Current value"
                  invalid={Boolean(errors.metricCurrent)}
                />
                <span className="text-slate-400">/</span>
              </>
            )}
            <Input
              type="number"
              min="0"
              step="any"
              value={values.metricTarget}
              onChange={(e) => setField("metricTarget", e.target.value)}
              placeholder="Target"
              aria-label="Target value"
              invalid={Boolean(errors.metricTarget)}
            />
            {values.metricType === "custom" ? (
              <Input value={values.metricUnit} onChange={(e) => setField("metricUnit", e.target.value)} placeholder="Unit" aria-label="Unit" className="w-28" />
            ) : (
              metricMeta?.unit && <span className="shrink-0 text-sm text-slate-500">{metricMeta.unit}</span>
            )}
          </div>
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <Field icon={Palette} label="Color" htmlFor="goal-color">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setField("color", "")}
              className={`h-7 rounded-md border px-2 text-xs ${values.color === "" ? "border-brand-500 text-brand-700" : "border-slate-200 text-slate-500"}`}
            >
              Life area
            </button>
            {GOAL_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                title={color.label}
                aria-label={color.label}
                aria-pressed={values.color === color.value}
                onClick={() => setField("color", color.value)}
                className={`h-6 w-6 rounded-full ring-offset-2 transition ${values.color === color.value ? "ring-2 ring-slate-800" : "hover:scale-110"}`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
        </Field>
        <Field icon={Star} label="Favorite">
          <Toggle checked={values.isFavorite} onChange={(v) => setField("isFavorite", v)} label="Favorite" />
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <ListChecks className="h-4 w-4 text-slate-400" aria-hidden="true" />
          Daily tasks
        </p>
        <GoalTasksEditor goalId={goal?.id} draftTasks={draftTasks} onDraftTasksChange={setDraftTasks} />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={submitting}>{isEdit ? "Save changes" : "Save"}</Button>
      </div>
    </form>
  );
}

/**
 * Wraps GoalForm in a Modal. The form is keyed by the goal id so switching
 * between "new" and "edit" always starts from fresh state.
 */
function GoalFormModal({ open, goal, defaults, lifeAreas, onSubmit, onClose }) {
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <GoalForm key={goal?.id ?? (defaults ? `new-${defaults.title}` : "new")} goal={goal} defaults={defaults} lifeAreas={lifeAreas} onSubmit={onSubmit} onCancel={onClose} />
    </Modal>
  );
}

export default GoalFormModal;
