const Task = require("../models/task.model");
const Goal = require("../models/goal.model");
const TaskCompletion = require("../models/taskCompletion.model");
const { getTodayDateKey } = require("../utils/date");
const {
  isNonEmptyString,
  parseBoolean,
  parsePositiveNumber,
  isValidDateKey,
  statusForError,
} = require("../utils/validation");
const { refreshTodayProgress } = require("../services/dailyProgress.service");
const { ROADMAP, isRoadmapTask, serializeTask, resolveSchedule } = require("../services/roadmap.service");
const mongoose = require("mongoose");
const crypto = require("node:crypto");

/** Optional roadmap-task fields from a request body. Returns { fields } or { error }. */
function roadmapFields(body) {
  const fields = {};
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 1000) return { error: "Description must be text under 1000 characters" };
    fields.description = body.description.trim();
  }
  if (body.estimatedMinutes !== undefined) {
    if (body.estimatedMinutes === null || body.estimatedMinutes === "") fields.estimatedMinutes = undefined;
    else {
      const minutes = Number(body.estimatedMinutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return { error: "Estimated time must be 1–600 minutes" };
      fields.estimatedMinutes = minutes;
    }
  }
  if (body.priority !== undefined) {
    if (body.priority !== null && !["high", "medium", "low"].includes(body.priority)) return { error: "Priority must be high, medium or low" };
    fields.priority = body.priority ?? undefined;
  }
  return { fields };
}

/**
 * @name POST /api/goals/:goalId/tasks
 * @description Add a task to a particular goal.
 * @access Private
 */

async function addTask(req, res) {
  try {
    const userId = req.user.id;
    const { goalId } = req.params;
    const { title } = req.body;

    if (req.body.kind !== undefined && req.body.kind !== "daily" && req.body.kind !== ROADMAP) {
      return res.status(400).json({ message: 'kind must be "daily" or "roadmap"' });
    }
    if (req.body.kind === ROADMAP) {
      return addRoadmapTask(req, res);
    }

    const weightage = parsePositiveNumber(req.body.weightage);

    if (!isNonEmptyString(title)) {
      return res.status(400).json({ message: "Give the task a title" });
    }
    if (weightage === null) {
      return res.status(400).json({ message: "Weightage must be a number greater than 0" });
    }

    const goal = await Goal.findOne({ _id: goalId, user: userId });

    if (!goal) {
      return res.status(404).json({
        message: "Goal not found",
      });
    }

    const task = await Task.create({
      userId,
      goalId,
      title,
      weightage,
    });

    res.status(201).json({
      message: "This task is created",
      task: task,
      goalProgress: await refreshTodayProgress(goal._id, userId, req.user.timeZone),
    });
  } catch (err) {
    res.status(statusForError(err)).json({
      message: err.message,
    });
  }
}

/** POST /api/goals/:goalId/tasks with kind "roadmap": a one-time task scheduled for one goal day. */
async function addRoadmapTask(req, res) {
  try {
    const userId = req.user.id;
    const { goalId } = req.params;
    const { title } = req.body;

    if (!isNonEmptyString(title) || title.trim().length > 200) {
      return res.status(400).json({ message: "Give the task a title (up to 200 characters)" });
    }
    const { fields, error } = roadmapFields(req.body);
    if (error) return res.status(400).json({ message: error });

    const goal = await Goal.findOne({ _id: goalId, user: userId });
    if (!goal) return res.status(404).json({ message: "Goal not found" });
    if (goal.completedAt) return res.status(400).json({ message: "This goal is completed" });

    const schedule = resolveSchedule(goal, { day: req.body.day, scheduledDate: req.body.scheduledDate });
    if (schedule.error) return res.status(400).json({ message: schedule.error });

    const sameDay = await Task.countDocuments({ goalId, userId, kind: ROADMAP, scheduledDate: schedule.date });
    const task = await Task.create({
      userId,
      goalId,
      kind: ROADMAP,
      title: title.trim(),
      ...fields,
      scheduledDate: schedule.date,
      originalScheduledDate: schedule.date,
      roadmapDay: schedule.day,
      roadmapOrder: sameDay,
      roadmapItemId: crypto.randomUUID(),
      source: "manual",
    });

    return res.status(201).json({
      message: "Roadmap task created",
      task: serializeTask(task, getTodayDateKey(req.user.timeZone)),
      goalProgress: await refreshTodayProgress(goal._id, userId, req.user.timeZone),
    });
  } catch (err) {
    return res.status(statusForError(err)).json({ message: err.message });
  }
}

/**
 * @name GET /api/tasks
 * @description Get every task of the logged-in user, flagged with whether it was completed today.
 * @access Private
 */
async function getUserTasks(req, res) {
  try {
    const userId = req.user.id;
    const today = getTodayDateKey(req.user.timeZone);

    const [tasks, completions] = await Promise.all([
      Task.find({ userId }).sort({ createdAt: 1 }),
      TaskCompletion.find({ userId, dateKey: today }, "taskId"),
    ]);

    const completedIds = new Set(completions.map((c) => c.taskId.toString()));

    res.status(200).json({
      today,
      timeZone: req.user.timeZone,
      Count: tasks.length,
      Tasks: tasks.map((task) =>
        isRoadmapTask(task)
          ? // Roadmap tasks are done once (completedAt) and carry today/pending/upcoming/completed.
            serializeTask(task, today)
          : {
              ...task.toObject(),
              // Daily goal tasks are ticked per day; a to-do is simply done or not.
              completedToday: task.goalId
                ? completedIds.has(task._id.toString())
                : Boolean(task.completedAt),
            }
      ),
    });
  } catch (err) {
    res.status(statusForError(err)).json({
      message: err.message,
    });
  }
}

/**
 * @name POST /api/tasks
 * @description Add a standalone to-do (not part of a goal), planned for `dueDate` (defaults to today).
 * @access Private
 */
// To-do priority: one of the Task schema's priorities, or null/"" for none.
const TODO_PRIORITIES = ["high", "medium", "low"];
function parsePriority(value) {
  if (value === undefined) return { value: undefined };
  if (value === null || value === "") return { value: null };
  return TODO_PRIORITIES.includes(value) ? { value } : { error: "Priority must be high, medium or low" };
}

async function addTodo(req, res) {
  try {
    const userId = req.user.id;
    const { title, dueDate = getTodayDateKey(req.user.timeZone) } = req.body;

    if (!isNonEmptyString(title) || title.trim().length > 200) {
      return res.status(400).json({ message: "Give the to-do a title (up to 200 characters)" });
    }
    if (!isValidDateKey(dueDate)) {
      return res.status(400).json({ message: "dueDate must be a valid YYYY-MM-DD date" });
    }
    const priority = parsePriority(req.body.priority);
    if (priority.error) return res.status(400).json({ message: priority.error });

    const task = await Task.create({ userId, title: title.trim(), dueDate, ...(priority.value ? { priority: priority.value } : {}) });

    return res.status(201).json({
      message: "To-do created",
      task: { ...task.toObject(), completedToday: false },
    });
  } catch (err) {
    return res.status(statusForError(err)).json({
      message: err.message,
    });
  }
}

/**
 * @name PATCH /api/tasks/:taskId
 * @description Update a to-do's title / due date, or mark it done (`completed: true|false`).
 * @access Private
 */
async function updateTodo(req, res) {
  try {
    const userId = req.user.id;
    const { taskId } = req.params;
    const { title, dueDate, completed } = req.body;

    const task = await Task.findOne({ _id: taskId, userId, goalId: null });

    if (!task) {
      return res.status(404).json({ message: "To-do not found" });
    }

    if (title !== undefined && (!isNonEmptyString(title) || title.trim().length > 200)) {
      return res.status(400).json({ message: "Give the to-do a title (up to 200 characters)" });
    }
    if (dueDate !== undefined && !isValidDateKey(dueDate)) {
      return res.status(400).json({ message: "dueDate must be a valid YYYY-MM-DD date" });
    }
    const priority = parsePriority(req.body.priority);
    if (priority.error) return res.status(400).json({ message: priority.error });
    const isCompleted = completed === undefined ? undefined : parseBoolean(completed);
    if (isCompleted === null) {
      return res.status(400).json({ message: "completed must be true or false" });
    }

    if (title !== undefined) task.title = title.trim();
    if (dueDate !== undefined) task.dueDate = dueDate;
    if (priority.value !== undefined) task.priority = priority.value ?? undefined;
    if (isCompleted !== undefined) task.completedAt = isCompleted ? new Date() : null;

    await task.save();

    return res.status(200).json({
      message: "To-do updated",
      task: { ...task.toObject(), completedToday: Boolean(task.completedAt) },
    });
  } catch (err) {
    return res.status(statusForError(err)).json({
      message: err.message,
    });
  }
}

/**
 * @name DELETE /api/tasks/:taskId
 * @description Delete a standalone to-do.
 * @access Private
 */
async function deleteTodo(req, res) {
  try {
    const userId = req.user.id;
    const { taskId } = req.params;

    const task = await Task.findOneAndDelete({ _id: taskId, userId, goalId: null });

    if (!task) {
      return res.status(404).json({ message: "To-do not found" });
    }

    return res.status(200).json({ message: "To-do deleted", task });
  } catch (err) {
    return res.status(statusForError(err)).json({ message: err.message });
  }
}

/**
 * @name Get  /api/goals/:goalId/tasks
 * @description Get all subtasks belonging to that goal.
 * @access Private
 */
async function getAllTasks(req, res) {
  try {
    const userId = req.user.id;
    const { goalId } = req.params;

    // A missing (or someone else's) goal is a 404, as on every other goal route — not an empty list.
    if (!(await Goal.exists({ _id: goalId, user: userId }))) {
      return res.status(404).json({ message: "Goal not found" });
    }

    const allTasks = await Task.find({ userId: userId, goalId: goalId });

    res.status(200).json({
      Count: allTasks.length,
      Tasks: allTasks,
    });

    // Task.find({ goalId: goalId });
  } catch (err) {
    res.status(statusForError(err)).json({
      message: err.message,
    });
  }
}

/**
 * @name GET /api/goals/:goalId/tasks/:subtaskId
 * @description Get the details of a particular subtask.
 * @access Private
 */

async function getOneTask(req, res) {
  try {
    const userId = req.user.id;
    const { goalId, taskId } = req.params;

    const task = await Task.findOne({ _id: taskId
        ,userId: userId, goalId: goalId,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found"
      });
    }

    return res.status(200).json({
      task
    });
  } catch (err) {
    res.status(statusForError(err)).json({
      message: err.message,
    });
  }
}

/**
 * @name PATCH /api/goals/:goalId/tasks/:taskId
 * @description Update a task or mark it as complete.
 * @access Private
 */
async function updateTask(req, res) {
  try {
    const userId = req.user.id;
    const { goalId, taskId } = req.params;
    const { title } = req.body;
    const weightage = req.body.weightage === undefined ? undefined : parsePositiveNumber(req.body.weightage);

    if (title !== undefined && !isNonEmptyString(title)) {
      return res.status(400).json({ message: "Give the task a title" });
    }
    if (weightage === null) {
      return res.status(400).json({ message: "Weightage must be a number greater than 0" });
    }

    const task = await Task.findOne({
      _id: taskId,
      userId: userId,
      goalId: goalId
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found"
      });
    }

    // Update only fields that were provided
    if (title !== undefined) {
      task.title = title;
    }

    if (isRoadmapTask(task)) {
      // Schedule and completion change only through their own operations, never by an edit.
      const { fields, error } = roadmapFields(req.body);
      if (error) return res.status(400).json({ message: error });
      task.set(fields);
    } else if (weightage !== undefined) {
      task.weightage = weightage;
    }


    await task.save();

    return res.status(200).json({
      message: "Task updated successfully",
      task: serializeTask(task, getTodayDateKey(req.user.timeZone)),
      goalProgress: await refreshTodayProgress(task.goalId, userId, req.user.timeZone),
    });

  } catch (err) {
    return res.status(statusForError(err)).json({
      message: err.message
    });
  }
}




/**
 * @name DELETE /api/goals/:goalId/subtasks/:subtaskId
 * @description Delete a particular subtask.
 * @access Private
 */

async function deleteTask(req, res) {
  try {
    const userId = req.user.id;
    const { goalId, taskId } = req.params;

    const task = await Task.findOneAndDelete({
      _id: taskId,
      userId: userId,
      goalId: goalId
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found"
      });
    }

    await TaskCompletion.deleteMany({ taskId, userId });

    return res.status(200).json({
      message: "Task deleted successfully",
      task,
      goalProgress: await refreshTodayProgress(task.goalId, userId, req.user.timeZone),
    });

  } catch (err) {
    return res.status(statusForError(err)).json({
      message: err.message
    });
  }
}

module.exports = { addTask, addTodo, updateTodo, deleteTodo, getUserTasks, getAllTasks, getOneTask , updateTask, deleteTask};
