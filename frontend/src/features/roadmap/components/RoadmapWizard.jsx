// Create a roadmap with AI: goal details -> generated draft -> "tailor it?" -> review -> confirm.
// The draft lives only in this component until the user confirms; nothing is saved before that.
// Each draft gets its own requestId, so retrying a failed confirmation can never save it twice.

import { useState } from "react";
import { ArrowLeft, Check, RefreshCw, SlidersHorizontal, Sparkles } from "lucide-react";
import { Alert, Button, Field, Input, Modal, Select, Textarea } from "../../../components/ui/index.js";
import { browserTimeZone, currentAppDateKey, formatLongDate } from "../../../lib/date.js";
import { errorMessage, fieldErrors } from "../../../lib/errors.js";
import { roadmapApi } from "../api/roadmap.api.js";
import RoadmapDraftPreview from "./RoadmapDraftPreview.jsx";

const DURATIONS = [7, 30, 60, 90];
const SKILL_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];
const MAX_DAYS = 120;
const newRequestId = () => crypto.randomUUID();

function GoalDetailsStep({ values, setField, errors }) {
  const custom = !DURATIONS.includes(Number(values.totalDays));
  return (
    <div className="flex flex-col gap-3">
      <Field label="Goal" htmlFor="rm-title" error={errors.title}>
        <Input id="rm-title" autoFocus value={values.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Learn conversational Spanish" invalid={Boolean(errors.title)} />
      </Field>
      <Field label="Description" htmlFor="rm-description">
        <Textarea id="rm-description" rows={2} value={values.description} onChange={(e) => setField("description", e.target.value)} placeholder="What do you want to achieve, and why?" />
      </Field>
      <Field label="Start date" htmlFor="rm-start" error={errors.startDate}>
        <Input id="rm-start" type="date" value={values.startDate} onChange={(e) => setField("startDate", e.target.value)} invalid={Boolean(errors.startDate)} />
      </Field>
      <Field label="Duration" htmlFor="rm-days" error={errors.totalDays}>
        <div className="flex flex-wrap items-center gap-1.5">
          {DURATIONS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={Number(values.totalDays) === days}
              onClick={() => setField("totalDays", String(days))}
              className={
                Number(values.totalDays) === days
                  ? "rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              }
            >
              {days} days
            </button>
          ))}
          <Input
            id="rm-days"
            type="number"
            min="1"
            max={MAX_DAYS}
            value={values.totalDays}
            onChange={(e) => setField("totalDays", e.target.value)}
            aria-label="Custom number of days"
            className={custom ? "w-24 border-brand-500" : "w-24"}
            invalid={Boolean(errors.totalDays)}
          />
        </div>
      </Field>
      <Field label="Time per day" htmlFor="rm-minutes" error={errors.dailyMinutes}>
        <div className="flex items-center gap-2">
          <Input id="rm-minutes" type="number" min="5" max="1440" value={values.dailyMinutes} onChange={(e) => setField("dailyMinutes", e.target.value)} placeholder="Optional" className="w-28" invalid={Boolean(errors.dailyMinutes)} />
          <span className="text-sm text-slate-500">minutes</span>
        </div>
      </Field>
      <Field label="Current level" htmlFor="rm-level">
        <Select id="rm-level" value={values.skillLevel} onChange={(e) => setField("skillLevel", e.target.value)} placeholder="Optional" options={SKILL_OPTIONS} />
      </Field>
      <Field label="Target outcome" htmlFor="rm-outcome">
        <Input id="rm-outcome" value={values.targetOutcome} onChange={(e) => setField("targetOutcome", e.target.value)} placeholder="Optional — e.g. hold a 10-minute conversation" />
      </Field>
    </div>
  );
}

const PREFERENCE_FIELDS = [
  ["knownTopics", "Topics I already understand", "e.g. greetings, numbers"],
  ["difficultTopics", "Topics I find difficult", "e.g. verb conjugation"],
  ["learningStyle", "How I like to learn or work", "e.g. short sessions, flashcards, hands-on projects"],
  ["constraints", "Anything else to consider", "e.g. busy on weekends, no paid tools"],
];

function TailorStep({ prefs, setPref }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">Tell the planner about yourself. Every field is optional.</p>
      <Field label="Time per day" htmlFor="tp-minutes">
        <div className="flex items-center gap-2">
          <Input id="tp-minutes" type="number" min="5" max="1440" value={prefs.dailyMinutes} onChange={(e) => setPref("dailyMinutes", e.target.value)} className="w-28" />
          <span className="text-sm text-slate-500">minutes</span>
        </div>
      </Field>
      <Field label="Current level" htmlFor="tp-level">
        <Select id="tp-level" value={prefs.skillLevel} onChange={(e) => setPref("skillLevel", e.target.value)} placeholder="Keep as is" options={SKILL_OPTIONS} />
      </Field>
      {PREFERENCE_FIELDS.map(([name, label, placeholder]) => (
        <Field key={name} label={label} htmlFor={`tp-${name}`}>
          <Textarea id={`tp-${name}`} rows={2} value={prefs[name]} onChange={(e) => setPref(name, e.target.value)} placeholder={placeholder} maxLength={1000} />
        </Field>
      ))}
    </div>
  );
}

function validateDetails(values) {
  const errors = {};
  if (!values.title.trim()) errors.title = "Give the goal a name.";
  if (!values.startDate) errors.startDate = "Pick a start date.";
  const days = Number(values.totalDays);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) errors.totalDays = `Choose 1–${MAX_DAYS} days.`;
  if (values.dailyMinutes !== "" && !(Number.isInteger(Number(values.dailyMinutes)) && Number(values.dailyMinutes) >= 5 && Number(values.dailyMinutes) <= 1440)) {
    errors.dailyMinutes = "Use 5–1440 minutes, or leave empty.";
  }
  return errors;
}

const optionalNumber = (value) => (value === "" || value == null ? null : Number(value));

/**
 * goal: an existing goal to plan (its dates are kept), or null to create a new goal.
 * onSaved(goal) runs after the roadmap is stored. onCreateWithoutAi(details), if given, lets the user
 * fall back to the regular goal form (prefilled) when the AI planner can't be used.
 */
function RoadmapWizard({ goal = null, today, onClose, onSaved, onCreateWithoutAi }) {
  const [step, setStep] = useState("details"); // details | choice | tailor | review
  const [values, setValues] = useState({
    title: "",
    description: "",
    // `today` comes from the task store; until it has loaded, use the browser's own date.
    startDate: today ?? currentAppDateKey(browserTimeZone()),
    totalDays: "30",
    dailyMinutes: goal?.dailyMinutes ? String(goal.dailyMinutes) : "",
    skillLevel: goal?.skillLevel ?? "",
    targetOutcome: goal?.targetOutcome ?? "",
  });
  const [errors, setErrors] = useState({});
  const [prefs, setPrefs] = useState({ dailyMinutes: "", skillLevel: "", knownTopics: "", difficultTopics: "", learningStyle: "", constraints: "" });
  const [draft, setDraft] = useState(null);
  const [requestId, setRequestId] = useState(null);
  const [busy, setBusy] = useState(null); // "generating" | "saving" | null
  // { message, note?, retry?: () => void, offerManual?: boolean } — what failed and what the user can do.
  const [error, setError] = useState(null);

  const setField = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };
  const setPref = (name, value) => setPrefs((p) => ({ ...p, [name]: value }));

  const goalPayload = () => ({
    title: values.title.trim(),
    description: values.description.trim(),
    startDate: values.startDate,
    totalDays: Number(values.totalDays),
    dailyMinutes: optionalNumber(values.dailyMinutes),
    skillLevel: values.skillLevel || null,
    targetOutcome: values.targetOutcome.trim(),
  });

  async function generate({ preferences = null, previousDraft = null, nextStep }) {
    setBusy("generating");
    setError(null);
    try {
      const target = goal ? { goalId: goal.id } : { goal: goalPayload() };
      const next = await roadmapApi.generate({ ...target, preferences, previousDraft });
      setDraft(next);
      setRequestId(newRequestId()); // a new draft is a new thing to confirm
      setStep(nextStep);
    } catch (err) {
      // A detail the server rejected is shown next to its input, on the details step.
      const byField = goal ? {} : fieldErrors(err, Object.keys(values));
      if (Object.keys(byField).length) {
        setErrors(byField);
        setStep("details");
      } else {
        const unavailable = ["AI_NOT_CONFIGURED", "AI_UNAVAILABLE", "AI_ERROR"].includes(err?.code);
        setError({
          message: errorMessage(err),
          note: goal
            ? "Your goal is safe — nothing about it has changed."
            : "Nothing has been saved yet, and your details are still here.",
          // Only failures that can pass on their own get a "Try again" (never bad input or setup problems).
          retry: err?.retryable && err.code !== "RATE_LIMITED" ? () => generate({ preferences, previousDraft, nextStep }) : null,
          offerManual: unavailable && !goal && Boolean(onCreateWithoutAi),
        });
      }
    } finally {
      setBusy(null);
    }
  }

  function handleGenerate() {
    if (!goal) {
      const nextErrors = validateDetails(values);
      if (Object.keys(nextErrors).length) return setErrors(nextErrors);
    }
    generate({ nextStep: "choice" });
  }

  function handleTailor() {
    const preferences = {
      dailyMinutes: optionalNumber(prefs.dailyMinutes),
      skillLevel: prefs.skillLevel || null,
      knownTopics: prefs.knownTopics.trim(),
      difficultTopics: prefs.difficultTopics.trim(),
      learningStyle: prefs.learningStyle.trim(),
      constraints: prefs.constraints.trim(),
    };
    generate({ preferences, previousDraft: draft, nextStep: "review" });
  }

  async function handleConfirm() {
    setBusy("saving");
    setError(null);
    try {
      // The exact details the draft was generated from, so the saved goal matches what was reviewed.
      const { goal: details } = draft;
      const target = goal
        ? { goalId: goal.id }
        : {
            goal: {
              title: details.title,
              description: details.description,
              startDate: details.startDate,
              totalDays: details.totalDays,
              dailyMinutes: details.dailyMinutes,
              skillLevel: details.skillLevel,
              targetOutcome: details.targetOutcome,
            },
          };
      const { goal: saved } = await roadmapApi.confirm({ requestId, draft, ...target });
      onSaved(saved);
    } catch (err) {
      // Same requestId on retry: if the first attempt did save (and only the answer was lost),
      // the server returns that goal instead of creating a second one.
      setError({
        message: errorMessage(err),
        note: "Your roadmap is still here — it is safe to try again.",
        retry: err?.code === "VALIDATION_ERROR" ? null : handleConfirm,
      });
      setBusy(null);
    }
  }

  function handleClose() {
    if (busy === "saving") return;
    if (draft && !window.confirm("Discard this roadmap? It has not been saved.")) return;
    onClose();
  }

  const generating = busy === "generating";
  const title = goal ? `Plan “${goal.title}” with AI` : "New goal with an AI roadmap";

  let body;
  let footer;
  if (step === "details") {
    body = goal ? (
      <div className="flex flex-col gap-2 text-sm text-slate-600">
        <p>
          The roadmap will cover this goal’s {goal.totalDays} days, from {formatLongDate(goal.startDate)} to {formatLongDate(goal.deadline)}.
        </p>
        <p>After it is generated you can tailor it to your time, level and preferences before anything is saved.</p>
      </div>
    ) : (
      <GoalDetailsStep values={values} setField={setField} errors={errors} />
    );
    footer = (
      <>
        <Button variant="secondary" onClick={handleClose}>Cancel</Button>
        <Button icon={Sparkles} onClick={handleGenerate} loading={generating}>{generating ? "Generating…" : "Generate roadmap"}</Button>
      </>
    );
  } else if (step === "tailor") {
    body = <TailorStep prefs={prefs} setPref={setPref} />;
    footer = (
      <>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep("review")} disabled={generating}>Back</Button>
        <Button icon={Sparkles} onClick={handleTailor} loading={generating}>{generating ? "Tailoring…" : "Tailor roadmap"}</Button>
      </>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {step === "choice" && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
            <p className="text-sm font-semibold text-slate-900">Would you like to tailor this roadmap to your needs?</p>
            <p className="mt-0.5 text-xs text-slate-600">Share your time, level and what you already know, and the plan is adjusted. Nothing is saved yet.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" icon={SlidersHorizontal} onClick={() => setStep("tailor")}>Yes, tailor my roadmap</Button>
              <Button size="sm" variant="secondary" onClick={() => setStep("review")}>No, use this roadmap</Button>
            </div>
          </div>
        )}
        {step === "review" && draft.tailored && (
          <Alert tone="info">This roadmap was tailored to your preferences. Review it, tailor again, or confirm to save it.</Alert>
        )}
        <RoadmapDraftPreview draft={draft} />
      </div>
    );
    footer =
      step === "review" ? (
        <>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => { setDraft(null); setStep("details"); }} disabled={Boolean(busy)} className="mr-auto">
            {goal ? "Start over" : "Edit details"}
          </Button>
          <Button variant="secondary" icon={RefreshCw} onClick={() => generate({ preferences: draft.preferences, nextStep: "review" })} loading={generating} disabled={busy === "saving"}>
            Regenerate
          </Button>
          <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setStep("tailor")} disabled={Boolean(busy)}>Tailor</Button>
          <Button icon={Check} onClick={handleConfirm} loading={busy === "saving"} disabled={generating}>Confirm &amp; save</Button>
        </>
      ) : (
        <Button variant="secondary" onClick={handleClose}>Cancel</Button>
      );
  }

  return (
    <Modal open onClose={handleClose} title={title} size="lg" footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">{footer}</div>}>
      <div className="flex flex-col gap-4" aria-busy={Boolean(busy)}>
        {error && (
          <Alert onDismiss={() => setError(null)}>
            <span className="block">{error.message}</span>
            {error.note && <span className="mt-0.5 block text-red-600/90">{error.note}</span>}
            {(error.retry || error.offerManual) && (
              <span className="mt-2 flex flex-wrap gap-2">
                {error.retry && (
                  <Button size="sm" variant="secondary" icon={RefreshCw} onClick={error.retry} disabled={Boolean(busy)}>
                    Try again
                  </Button>
                )}
                {error.offerManual && (
                  <Button size="sm" variant="secondary" onClick={() => onCreateWithoutAi(goalPayload())} disabled={Boolean(busy)}>
                    Create the goal without a roadmap
                  </Button>
                )}
              </span>
            )}
          </Alert>
        )}
        {generating && (
          <p role="status" className="text-sm text-slate-500">
            {step === "details" ? "Generating your roadmap…" : step === "tailor" ? "Tailoring your roadmap…" : "Generating a new version…"} This can take up to a minute for longer plans.
          </p>
        )}
        {body}
      </div>
    </Modal>
  );
}

export default RoadmapWizard;
