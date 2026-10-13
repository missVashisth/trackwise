const Goal = require("../models/goal.model");
const Task = require("../models/task.model");
const TaskCompletion = require("../models/taskCompletion.model");
const DailyProgress = require("../models/dailyProgress.model");
const LifeArea = require("../models/lifeArea.model");
const mongoose = require("mongoose");
const { isNonEmptyString, parseBoolean, statusForError } = require("../utils/validation");
const notificationEvents = require("../services/notifications/notification.events");
const { getProgressByGoal, refreshTodayProgress, isGoalRunningOn, goalStatusOn } = require("../services/dailyProgress.service");
const { getGoalInsights } = require("../services/goalInsights.service");
const { getRoadmap } = require("../services/roadmap.service");
const { getTodayDateKey } = require("../utils/date");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const EDITABLE_FIELDS = [
  "title",
  "description",
  "totalDays",
  "startDate",
  "completedAt",
  "lifeAreaId",
  "parentGoalId",
  "impact",
  "metric",
  "color",
  "isFavorite",
  "dailyMinutes",
  "skillLevel",
  "targetOutcome",
];

// Returns { fields } or { error } when a value can be rejected before reaching Mongoose.
function pickEditable(body) {
  const fields = {};
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  if (fields.title !== undefined && !isNonEmptyString(fields.title)) {
    return { error: "Give the goal a title" };
  }
  // A deadline without a duration is turned into a duration (deadline is the last day).
  if (body.deadline && body.totalDays === undefined && body.startDate) {
    const span = Math.round((new Date(body.deadline) - new Date(body.startDate)) / MS_PER_DAY);
    fields.totalDays = span + 1;
  }
  // isActive is kept for older clients; completedAt is the source of truth.
  if (body.isActive !== undefined && body.completedAt === undefined) {
    const isActive = parseBoolean(body.isActive);
    if (isActive === null) return { error: "isActive must be true or false" };
    fields.completedAt = isActive ? null : new Date();
  }
  return { fields };
}

const MAX_GOAL_DEPTH = 50;

/** True when making `parentGoalId` the parent of `goalId` would create a loop. */
async function createsCycle(goalId, parentGoalId, userId) {
  let current = parentGoalId;
  for (let depth = 0; current && depth < MAX_GOAL_DEPTH; depth++) {
    if (String(current) === String(goalId)) return true;
    const parent = await Goal.findOne({ _id: current, user: userId }, "parentGoalId");
    current = parent?.parentGoalId;
  }
  return Boolean(current);
}

/** The goal plus every subgoal below it, at any depth, owned by the user. */
async function collectGoalTree(rootId, userId) {
  const ids = [rootId];
  let frontier = [rootId];
  for (let depth = 0; frontier.length && depth < MAX_GOAL_DEPTH; depth++) {
    const children = await Goal.find({ parentGoalId: { $in: frontier }, user: userId }, "_id");
    frontier = children.map((g) => g._id).filter((id) => !ids.some((seen) => seen.equals(id)));
    ids.push(...frontier);
  }
  return ids;
}

// Returns an error message when a referenced life area / parent goal is not the user's.
async function checkReferences(fields, userId, goalId) {
  if (fields.lifeAreaId) {
    if (!mongoose.Types.ObjectId.isValid(fields.lifeAreaId)) return "Invalid life area";
    const lifeArea = await LifeArea.exists({ _id: fields.lifeAreaId, user: userId });
    if (!lifeArea) return "Life area not found";
  }
  if (fields.parentGoalId) {
    if (!mongoose.Types.ObjectId.isValid(fields.parentGoalId)) return "Invalid parent goal";
    if (goalId && String(fields.parentGoalId) === String(goalId)) return "A goal cannot be its own parent";
    const parent = await Goal.exists({ _id: fields.parentGoalId, user: userId });
    if (!parent) return "Parent goal not found";
    if (goalId && (await createsCycle(goalId, fields.parentGoalId, userId))) {
      return "A goal cannot be placed under one of its own subgoals";
    }
  }
  return null;
}

const EMPTY_PROGRESS = { basis: "daily", overall: 0, today: 0, history: [] };

/** Goal JSON plus its task-based progress and whether it runs today (the user's today). */
function serializeGoal(goal, progressByGoal, today) {
  const data = goal.toObject();

  return {
    ...data,
    isOngoing: isGoalRunningOn(goal, today),
    status: goalStatusOn(goal, today),
    progress: progressByGoal.get(goal._id.toString()) ?? EMPTY_PROGRESS,
  };
}

async function serializeOne(goal, userId, timeZone) {
  return serializeGoal(goal, await getProgressByGoal(userId, [goal._id], timeZone), getTodayDateKey(timeZone));
}

/**
 * @name addNewGoalController
 * @description register a new Goal for logged in user , user id in req
 * @access Private
 */

async function addNewGoalController(req, res) {
  try {
    const userId = req.user.id;
    const { fields, error } = pickEditable(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const referenceError = await checkReferences(fields, userId);
    if (referenceError) {
      return res.status(400).json({ message: referenceError });
    }

    if (fields.metric && fields.metric.current !== undefined) {
      fields.history = [fields.metric.current];
    }

    // Start dates are calendar days; default to the user's own today, not the server's.
    if (fields.startDate === undefined) {
      fields.startDate = getTodayDateKey(req.user.timeZone);
    }

    const goal = await Goal.create({ ...fields, user: userId });

    return res.status(201).json({
      message: "Goal created successfully",
      goal: await serializeOne(goal, userId, req.user.timeZone),
    });
  } catch (err) {
    return res.status(statusForError(err)).json({
      message: err.message,
    });
  }
}

/**
 * @name getAllGoalController
 * @description Get all goals belonging to the logged-in user, with their progress.
 * @access Private
 */

async function getAllGoalController(req, res) {
  try {
    const userId = req.user.id;

    const [allGoals, progressByGoal] = await Promise.all([
      Goal.find({ user: userId }),
      getProgressByGoal(userId, undefined, req.user.timeZone),
    ]);

    const today = getTodayDateKey(req.user.timeZone);

    res.status(200).json({
      today,
      Count: allGoals.length,
      Data: allGoals.map((goal) => serializeGoal(goal, progressByGoal, today)),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message,
    });
  }
}

/**
 * @name GET /getOneGoalController
 * @description Get a specific goal, including its details.
 * @access Private
 */

async function getOneGoalController(req, res) {
  try {
    const { goalId } = req.params;
    const userId = req.user.id;

    const goal = await Goal.findOne({
      _id: goalId,
      user: userId,
    });

    if (!goal) {
      return res.status(404).json({
        message: "Goal not found",
      });
    }

    return res.status(200).json({
      goal: await serializeOne(goal, userId, req.user.timeZone),
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message,
    });
  }
}

/**
 * @name GET /api/goals/:goalId/insights
 * @description Progress history, consistency and recent activity of one goal (goal dashboard).
 * @access Private
 */

async function getGoalInsightsController(req, res) {
  try {
    const insights = await getGoalInsights(req.params.goalId, req.user.id, req.user.timeZone);

    if (!insights) {
      return res.status(404).json({
        message: "Goal not found",
      });
    }

    return res.status(200).json({ insights });
  } catch (err) {
    return res.status(500).json({
      message: err.message,
    });
  }
}

/**
 * @name GET /api/goals/:goalId/roadmap
 * @description The goal's roadmap: tasks in order, grouped into today / pending / upcoming /
 * completed for the user's local date, plus roadmap progress.
 * @access Private
 */

async function getGoalRoadmapController(req, res) {
  try {
    const roadmap = await getRoadmap(req.params.goalId, req.user.id, req.user.timeZone);

    if (!roadmap) {
      return res.status(404).json({
        message: "Goal not found",
      });
    }

    return res.status(200).json(roadmap);
  } catch (err) {
    return res.status(500).json({
      message: err.message,
    });
  }
}

/**
 * @name PATCH /api/goals/:goalId
 * @description Update any editable field of a goal.
 * @access Private
 */

async function updateGoal(req, res) {

  try {
    const { goalId } = req.params;
    const userId = req.user.id;

    // Validate goal ID
    if (!mongoose.Types.ObjectId.isValid(goalId)) {
      return res.status(400).json({
        message: "Invalid goal ID",
      });
    }

    const goal = await Goal.findOne({_id: goalId, user : userId});

    if(!goal) {
      return res.status(404).json({
        message: "Goal not found",
      });
    }

    const { fields, error } = pickEditable(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const referenceError = await checkReferences(fields, userId, goalId);
    if (referenceError) {
      return res.status(400).json({ message: referenceError });
    }

    const previousCurrent = goal.metric?.current;
    const previousTotalDays = goal.totalDays;
    const wasCompleted = Boolean(goal.completedAt);

    goal.set(fields);

    if (fields.metric && fields.metric.current !== previousCurrent) {
      goal.history.push(fields.metric.current);
    }

    await goal.save();

    // Today's daily target depends on the duration.
    if (goal.totalDays !== previousTotalDays) {
      await refreshTodayProgress(goal._id, userId, req.user.timeZone);
    }

    if (!wasCompleted && goal.completedAt) {
      notificationEvents.goalCompleted({ userId, goal });
    }

    return res.status(200).json({
      message: "Goal Updated Successfully",
      goal: await serializeOne(goal, userId, req.user.timeZone),
    });
  } catch (error) {
    return res.status(statusForError(error)).json({
      message: error.message,
    });
  }
}


/**
 * @name delete deleteGoal
 * @description Delete a goal together with its subgoals and their tasks.
 * @access Private
 */
async function deleteGoal(req,res){
    try{
        const {goalId} = req.params;
        const userId = req.user.id;

        const goal = await Goal.findOne({_id: goalId, user : userId});

        if (!goal) {
            return res.status(404).json({
                message: "Goal not found"
            });
        }

        const goalIds = await collectGoalTree(goal._id, userId);

        await Promise.all([
            Goal.deleteMany({ _id: { $in: goalIds }, user: userId }),
            Task.deleteMany({ goalId: { $in: goalIds }, userId }),
            TaskCompletion.deleteMany({ goalId: { $in: goalIds }, userId }),
            DailyProgress.deleteMany({ goalId: { $in: goalIds }, userId }),
        ]);

        return res.status(200).json({
            message : "Goal Is Deleted Successfully",
            goal,
            deletedGoalIds: goalIds,
        })
    }catch(err){
        res.status(500).json({
            message: err.message
        })
    }
}

module.exports = {
  serializeOne,
  addNewGoalController,
  getAllGoalController,
  getOneGoalController,
  getGoalInsightsController,
  getGoalRoadmapController,
  updateGoal,
  deleteGoal
};
