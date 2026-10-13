// Form state + validation for creating / editing a goal.

import { useCallback, useState } from "react";
import { IMPACT, METRIC_BY_TYPE } from "../goals.constants.js";
import { addDays, daysBetween, toDateInputValue } from "../../../lib/date.js";
import { errorMessage, fieldErrors } from "../../../lib/errors.js";

// The deadline is the goal's last day, so a 1-day goal ends on its start date.
function deadlineFor(startDate, totalDays) {
  const days = Number(totalDays);
  if (!startDate || !Number.isInteger(days) || days < 1) return "";
  return toDateInputValue(addDays(startDate, days - 1));
}

export function toFormValues(goal, defaultValues) {
  const defaults = defaultValues ?? {}; // callers pass null for "no defaults"
  return {
    title: goal?.title ?? defaults.title ?? "",
    description: goal?.description ?? defaults.description ?? "",
    lifeAreaId: goal?.lifeAreaId ?? defaults.lifeAreaId ?? "",
    impact: goal?.impact ?? IMPACT.MEDIUM,
    startDate: toDateInputValue(goal?.startDate ?? defaults.startDate ?? new Date()),
    deadline: toDateInputValue(goal?.deadline) || (!goal && defaults.startDate && defaults.totalDays ? deadlineFor(defaults.startDate, defaults.totalDays) : ""),
    totalDays: goal?.totalDays ?? defaults.totalDays ?? "",
    metricType: goal?.metric?.type ?? "numeric",
    metricCurrent: goal?.metric?.current ?? 0,
    metricTarget: goal?.metric?.target ?? "",
    metricUnit: goal?.metric?.unit ?? "",
    color: goal?.color ?? "",
    isFavorite: goal?.isFavorite ?? false,
  };
}

export function toPayload(values) {
  const metricMeta = METRIC_BY_TYPE[values.metricType] ?? METRIC_BY_TYPE.numeric;
  const unit = values.metricType === "custom" ? values.metricUnit : metricMeta.unit;

  return {
    title: values.title.trim(),
    description: values.description.trim(),
    lifeAreaId: values.lifeAreaId || null,
    impact: values.impact,
    startDate: values.startDate,
    totalDays: Number(values.totalDays),
    metric: {
      type: values.metricType,
      current: Number(values.metricCurrent) || 0,
      target: Number(values.metricTarget),
      unit,
      prefix: Boolean(metricMeta.prefix),
    },
    color: values.color || null,
    isFavorite: values.isFavorite,
  };
}

export function validate(values) {
  const errors = {};
  if (!values.title.trim()) errors.title = "Give your goal a name.";
  if (!values.startDate) errors.startDate = "Pick a start date.";
  const days = Number(values.totalDays);
  if (!Number.isInteger(days) || days < 1) errors.totalDays = "Enter a whole number of days, at least 1.";
  if (values.deadline && values.startDate && values.deadline < values.startDate) {
    errors.deadline = "Deadline must be after the start date.";
  }
  if (!values.metricTarget || Number(values.metricTarget) <= 0) errors.metricTarget = "Set a target above 0.";
  if (Number(values.metricCurrent) < 0) errors.metricCurrent = "Cannot be negative.";
  return errors;
}

// Keeps start date, duration and deadline consistent whichever one is edited.
function applyField(prev, name, value) {
  const next = { ...prev, [name]: value };
  if (name === "totalDays" || name === "startDate") {
    next.deadline = deadlineFor(next.startDate, next.totalDays) || next.deadline;
  } else if (name === "deadline" && value && next.startDate && value >= next.startDate) {
    next.totalDays = daysBetween(next.startDate, value) + 1;
  }
  return next;
}

export function useGoalForm({ goal, defaults, onSubmit }) {
  const [values, setValues] = useState(() => toFormValues(goal, defaults));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const setField = useCallback((name, value) => {
    setValues((prev) => applyField(prev, name, value));
    setErrors((prev) =>
      prev[name] || prev.deadline || prev.totalDays
        ? { ...prev, [name]: undefined, deadline: undefined, totalDays: undefined }
        : prev,
    );
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event?.preventDefault();
      const nextErrors = validate(values);
      if (Object.keys(nextErrors).length) {
        setErrors(nextErrors);
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        await onSubmit(toPayload(values));
      } catch (err) {
        // A rejected field is shown next to its input; anything else above the form (never both).
        const byField = fieldErrors(err, Object.keys(values));
        if (Object.keys(byField).length) setErrors(byField);
        else setSubmitError(errorMessage(err));
      } finally {
        setSubmitting(false);
      }
    },
    [values, onSubmit],
  );

  return { values, errors, submitting, submitError, setField, handleSubmit };
}
