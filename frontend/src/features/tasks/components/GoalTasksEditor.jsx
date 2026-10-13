import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Button, IconButton, Input } from "../../../components/ui/index.js";
import { useTasks } from "../hooks/useTasks.js";

const isValidWeightage = (value) => value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;

function TaskRow({ task, onSave, onDelete }) {
  const [title, setTitle] = useState(task.title);
  const [weightage, setWeightage] = useState(String(task.weightage));

  function save() {
    const nextTitle = title.trim();
    if (!nextTitle || !isValidWeightage(weightage)) {
      setTitle(task.title);
      setWeightage(String(task.weightage));
      return;
    }
    if (nextTitle === task.title && Number(weightage) === task.weightage) return;
    onSave(task, { title: nextTitle, weightage: Number(weightage) });
  }

  return (
    <li className="flex items-center gap-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} aria-label="Task title" />
      <Input
        type="number"
        min="0"
        step="any"
        value={weightage}
        onChange={(e) => setWeightage(e.target.value)}
        onBlur={save}
        aria-label="Task weightage"
        className="w-24"
      />
      <IconButton icon={Trash2} label="Remove task" onClick={() => onDelete(task)} />
    </li>
  );
}

function TaskList({ tasks, onAdd, onSave, onDelete, busy }) {
  const [draft, setDraft] = useState({ title: "", weightage: "1" });
  const canAdd = draft.title.trim() && isValidWeightage(draft.weightage);

  async function handleAdd() {
    if (!canAdd) return;
    const added = await onAdd({ title: draft.title.trim(), weightage: Number(draft.weightage) });
    if (added !== false) setDraft({ title: "", weightage: "1" });
  }

  const totalWeight = tasks.reduce((sum, t) => sum + t.weightage, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>Task</span>
        <span className="mr-10 w-24">Weightage</span>
      </div>

      {tasks.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onSave={onSave} onDelete={onDelete} />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a daily task"
          aria-label="New task title"
        />
        <Input
          type="number"
          min="0"
          step="any"
          value={draft.weightage}
          onChange={(e) => setDraft((d) => ({ ...d, weightage: e.target.value }))}
          aria-label="New task weightage"
          className="w-24"
        />
        <Button variant="secondary" icon={Plus} onClick={handleAdd} loading={busy} disabled={!canAdd} aria-label="Add task" className="w-9 shrink-0 px-0" />
      </div>

      {tasks.length > 0 && (
        <p className="text-xs text-slate-500">
          Each day, ticking a task adds its share of the day’s progress: weightage ÷ {totalWeight} (total weight).
        </p>
      )}
    </div>
  );
}

/** Tasks of an existing goal — every change is saved immediately. */
function SavedGoalTasks({ goalId }) {
  const { tasksByGoal, actionError, clearActionError, createTask, updateTask, deleteTask } = useTasks();
  const [busy, setBusy] = useState(false);
  // Only daily (recurring) tasks have a weightage; roadmap tasks are managed on the goal's roadmap.
  const tasks = (tasksByGoal.get(goalId) ?? []).filter((t) => !t.isRoadmap);

  async function add(payload) {
    setBusy(true);
    try {
      await createTask({ goalId, ...payload });
      return true;
    } catch {
      return false; // shown via actionError
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {actionError && <Alert onDismiss={clearActionError}>{actionError}</Alert>}
      <TaskList
        tasks={tasks}
        busy={busy}
        onAdd={add}
        onSave={(task, patch) => updateTask(task, patch).catch(() => {})}
        onDelete={(task) => deleteTask(task).catch(() => {})}
      />
    </div>
  );
}

/** Tasks for a goal that is not saved yet — kept locally and created with the goal. */
function DraftGoalTasks({ tasks, onChange }) {
  return (
    <TaskList
      tasks={tasks}
      onAdd={(payload) => onChange([...tasks, { id: crypto.randomUUID(), ...payload }])}
      onSave={(task, patch) => onChange(tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t)))}
      onDelete={(task) => onChange(tasks.filter((t) => t.id !== task.id))}
    />
  );
}

function GoalTasksEditor({ goalId, draftTasks, onDraftTasksChange }) {
  return goalId ? (
    <SavedGoalTasks goalId={goalId} />
  ) : (
    <DraftGoalTasks tasks={draftTasks} onChange={onDraftTasksChange} />
  );
}

export default GoalTasksEditor;
