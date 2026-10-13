const LifeArea = require("../models/lifeArea.model");
const Goal = require("../models/goal.model");

const DEFAULT_LIFE_AREAS = [
  { name: "Work & Career", emoji: "💼", colorHex: "#4f46e5" },
  { name: "Sport & Health", emoji: "🏃", colorHex: "#ea580c" },
  { name: "Personal development", emoji: "📚", colorHex: "#16a34a" },
  { name: "Finances", emoji: "💰", colorHex: "#d97706" },
  { name: "Fun & Relaxation", emoji: "🎨", colorHex: "#db2777" },
];

/** Upsert each default by name, so overlapping first requests converge on one copy of each. */
async function seedDefaults(userId) {
  try {
    await LifeArea.bulkWrite(
      DEFAULT_LIFE_AREAS.map((area) => ({
        updateOne: {
          filter: { user: userId, name: area.name },
          update: { $setOnInsert: { ...area, user: userId } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (err) {
    // A concurrent request inserted the same default first; the unique index rejected ours.
    if (err.code !== 11000 && !err.writeErrors?.every((e) => e.code === 11000)) throw err;
  }
}

/**
 * Users seeded before seeding was idempotent may have duplicate areas.
 * Keep the oldest of each name, point their goals at it, and remove the rest.
 */
async function mergeDuplicates(userId, lifeAreas) {
  const byName = new Map();
  for (const area of lifeAreas) {
    if (!byName.has(area.name)) byName.set(area.name, []);
    byName.get(area.name).push(area);
  }

  let merged = false;
  for (const [, areas] of byName) {
    if (areas.length < 2) continue;
    const [keep, ...duplicates] = areas;
    const duplicateIds = duplicates.map((a) => a._id);
    await Goal.updateMany({ user: userId, lifeAreaId: { $in: duplicateIds } }, { $set: { lifeAreaId: keep._id } });
    await LifeArea.deleteMany({ _id: { $in: duplicateIds }, user: userId });
    merged = true;
  }
  return merged;
}

const findForUser = (userId) => LifeArea.find({ user: userId }).sort({ createdAt: 1, _id: 1 });

/**
 * @name GET /api/life-areas
 * @description Get the logged-in user's life areas, creating the defaults on first use.
 * @access Private
 */
async function getLifeAreas(req, res) {
  try {
    const userId = req.user.id;

    let lifeAreas = await findForUser(userId);

    if (lifeAreas.length === 0) {
      await seedDefaults(userId);
      lifeAreas = await findForUser(userId);
    } else if (await mergeDuplicates(userId, lifeAreas)) {
      lifeAreas = await findForUser(userId);
    }

    return res.status(200).json({ lifeAreas });
  } catch (err) {
    return res.status(500).json({
      message: err.message,
    });
  }
}

module.exports = { getLifeAreas };
