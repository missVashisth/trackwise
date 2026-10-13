import { useState } from "react";
import { AlignLeft, Calendar, Clock, Flag, ListChecks, Scale, Target } from "lucide-react";
import { Alert, Button, Field, Input, Modal, Select, Textarea } from "../../../components/ui/index.js";
import { toDateInputValue } from "../../../lib/date.js";
import { errorMessage } from "../../../lib/errors.js";
import { PRIORITY_OPTIONS } from "../tasks.constants.js";

function TaskForm({ task, goals, defaultGoalId, defaultKind, lockGoal, today, onSubmit, onCancel }) {
  const isEdit = Boolean(task);
  // Roadmap task: one-time, scheduled for a day of the goal (kind is fixed once created).
  const isRoadmap = isEdit ? Boolean(task.isRoadmap) : defaultKind === "roadmap";
  const [values, setValues] = useState({
    title: task?.title ?? "",
    goalId: task?.goalId ?? defaultGoalId ?? "",
    weightage: task?.weightage ?? 1,
    dueDate: task?.dueDate ?? today ?? "",
    scheduledDate: task?.scheduledDate ?? today ?? "",
    description: task?.description ?? "",
    estimatedMinutes: task?.estimatedMinutes ?? "",
    priority: task?.priority ?? "",
  });
  const isTodo = !values.goalId;
  const goal = goals.find((g) => g.id === values.goalId);
  const minDate = goal ? toDateInputValue(goal.startDate) : undefined;
  const maxDate = goal ? toDateInputValue(goal.deadline) : undefined;
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  function setField(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!values.title.trim()) nextErrors.title = "Give your task a name.";
    const weightage = Number(values.weightage);
    const minutes = values.estimatedMinutes === "" ? null : Number(values.estimatedMinutes);
    if (isRoadmap) {
      if (!isEdit && (!values.scheduledDate || (minDate && values.scheduledDate < minDate) || (maxDate && values.scheduledDate > maxDate))) {
        nextErrors.scheduledDate = "Pick a day between the goal’s start date and deadline.";
      }
      if (minutes !== null && !(Number.isInteger(minutes) && minutes >= 1 && minutes <= 600)) nextErrors.estimatedMinutes = "Use 1–600 minutes, or leave empty.";
    } else if (isTodo) {
      if (!values.dueDate) nextErrors.dueDate = "Pick the day for this to-do.";
    } else if (values.weightage === "" || !Number.isFinite(weightage) || weightage <= 0) {
      nextErrors.weightage = "Set a weightage above 0.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const title = values.title.trim();
      const roadmapFields = { description: values.description.trim(), estimatedMinutes: minutes };
      await onSubmit(
        isRoadmap
          ? isEdit
            ? { title, goalId: values.goalId, ...roadmapFields }
            : { title, goalId: values.goalId, kind: "roadmap", scheduledDate: values.scheduledDate, ...roadmapFields }
          : isTodo
            ? { title, goalId: null, dueDate: values.dueDate, priority: values.priority || null }
            : { title, goalId: values.goalId, weightage },
      );
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {submitError && <Alert>{submitError}</Alert>}

      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
          <ListChecks className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2.5">
          <input
            autoFocus
            value={values.title}
            onChange={(e) => setField("title", e.target.value)}
            placeholder="Task name"
            aria-label="Task name"
            aria-invalid={Boolean(errors.title)}
            className="w-full border-0 bg-transparent p-0 text-lg font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          {errors.title && <p className="text-xs text-red-600">{errors.title}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <Field icon={Target} label="Goal" htmlFor="task-goal" error={errors.goalId}>
          <Select
            id="task-goal"
            value={values.goalId}
            onChange={(e) => setField("goalId", e.target.value)}
            placeholder={lockGoal ? undefined : "No goal — just a to-do"}
            options={goals.map((goal) => ({ value: goal.id, label: goal.title }))}
            disabled={isEdit || lockGoal}
            invalid={Boolean(errors.goalId)}
          />
        </Field>
        {isRoadmap ? (
          <>
            <Field icon={Calendar} label="Scheduled for" htmlFor="task-scheduled" error={errors.scheduledDate}>
              <Input
                id="task-scheduled"
                type="date"
                min={minDate}
                max={maxDate}
                value={values.scheduledDate}
                onChange={(e) => setField("scheduledDate", e.target.value)}
                disabled={isEdit}
                invalid={Boolean(errors.scheduledDate)}
              />
            </Field>
            <Field icon={Clock} label="Estimated time" htmlFor="task-minutes" error={errors.estimatedMinutes}>
              <div className="flex items-center gap-2">
                <Input id="task-minutes" type="number" min="1" max="600" value={values.estimatedMinutes} onChange={(e) => setField("estimatedMinutes", e.target.value)} placeholder="Optional" className="w-28" invalid={Boolean(errors.estimatedMinutes)} />
                <span className="text-sm text-slate-500">minutes</span>
              </div>
            </Field>
            <Field icon={AlignLeft} label="Description" htmlFor="task-description">
              <Textarea id="task-description" rows={2} value={values.description} onChange={(e) => setField("description", e.target.value)} placeholder="Optional" maxLength={1000} />
            </Field>
          </>
        ) : isTodo ? (
          <>
            <Field icon={Calendar} label="Day" htmlFor="task-due" error={errors.dueDate}>
              <Input
                id="task-due"
                type="date"
                value={values.dueDate}
                onChange={(e) => setField("dueDate", e.target.value)}
                invalid={Boolean(errors.dueDate)}
              />
            </Field>
            <Field icon={Flag} label="Priority" htmlFor="task-priority">
              <Select id="task-priority" value={values.priority} onChange={(e) => setField("priority", e.target.value)} options={PRIORITY_OPTIONS} />
            </Field>
          </>
        ) : (
          <Field icon={Scale} label="Weightage" htmlFor="task-weightage" error={errors.weightage}>
            <Input
              id="task-weightage"
              type="number"
              min="0"
              step="any"
              value={values.weightage}
              onChange={(e) => setField("weightage", e.target.value)}
              invalid={Boolean(errors.weightage)}
            />
          </Field>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={submitting}>{isEdit ? "Save changes" : "Save"}</Button>
      </div>
    </form>
  );
}

const isRoadmapTask = (task) => Boolean(task?.isRoadmap);

function TaskFormModal({ open, task, goals, defaultGoalId, defaultKind = "daily", lockGoal = false, today, onSubmit, onClose }) {
  return (
    <Modal open={open} onClose={onClose}>
      <TaskForm
        key={task?.id ?? `new-${defaultGoalId ?? ""}-${defaultKind}`}
        task={task}
        goals={goals}
        defaultGoalId={defaultGoalId}
        defaultKind={defaultKind}
        lockGoal={lockGoal || isRoadmapTask(task)}
        today={today}
        onSubmit={onSubmit}
        onCancel={onClose}
      />
    </Modal>
  );
}

export default TaskFormModal;
