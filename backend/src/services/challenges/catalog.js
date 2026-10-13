// Built-in challenge templates. Inserted once (by slug) the first time the catalogue is read; an
// existing entry is never overwritten, so editing this file does not change running challenges.
// Targets are example defaults, not medical or fitness advice — participants can adjust the ones
// marked customizable.

const DEFAULTS_NOTE = "Targets are example defaults — adjust them to what is right for you.";

const BUILT_IN_TEMPLATES = [
  {
    slug: "75-hard",
    title: "75 Hard",
    description: `75 days of daily discipline: reading, training, water and sleep, every single day. ${DEFAULTS_NOTE}`,
    category: "fitness",
    difficulty: "hard",
    durationDays: 75,
    strict: true,
    activities: [
      { key: "read", title: "Read", description: "Non-fiction or learning material.", kind: "numeric", target: 10, unit: "pages", required: true, customizable: true },
      { key: "workout", title: "Workout", description: "Any training session.", kind: "numeric", target: 45, unit: "minutes", required: true, customizable: true },
      { key: "water", title: "Drink water", kind: "numeric", target: 3, unit: "litres", required: true, customizable: true },
      { key: "sleep", title: "Sleep", kind: "numeric", target: 7, unit: "hours", required: true, customizable: true },
    ],
  },
  {
    slug: "winter-arc",
    title: "Winter Arc",
    description: `90 days to build momentum through the colder months: train, read and keep a clean routine. ${DEFAULTS_NOTE}`,
    category: "lifestyle",
    difficulty: "medium",
    durationDays: 90,
    activities: [
      { key: "train", title: "Train", kind: "numeric", target: 30, unit: "minutes", required: true, customizable: true },
      { key: "read", title: "Read", kind: "numeric", target: 20, unit: "minutes", required: true, customizable: true },
      { key: "no-junk", title: "No junk food", kind: "checkbox", required: true },
      { key: "journal", title: "Journal", description: "A few lines about the day.", kind: "checkbox", required: false, customizable: true },
    ],
  },
  {
    slug: "30-days-no-sugar",
    title: "30 Days No Sugar",
    description: `A month without added sugar. Track each day honestly — a slip doesn't undo the rest. ${DEFAULTS_NOTE}`,
    category: "wellness",
    difficulty: "medium",
    durationDays: 30,
    activities: [
      { key: "no-sugar", title: "No added sugar", kind: "checkbox", required: true },
      { key: "water", title: "Drink water", kind: "numeric", target: 2, unit: "litres", required: false, customizable: true },
    ],
  },
  {
    slug: "reading-30",
    title: "Reading Challenge",
    description: `Read a little every day for 30 days. ${DEFAULTS_NOTE}`,
    category: "learning",
    difficulty: "easy",
    durationDays: 30,
    activities: [{ key: "read", title: "Read", kind: "numeric", target: 20, unit: "pages", required: true, customizable: true }],
  },
  {
    slug: "focus-sprint-21",
    title: "Deep Work Sprint",
    description: `Four weeks of focused workdays on what matters, with a short plan for tomorrow. Weekends are rest days. ${DEFAULTS_NOTE}`,
    category: "productivity",
    difficulty: "medium",
    durationDays: 28,
    activities: [
      { key: "deep-work", title: "Deep work", kind: "numeric", target: 120, unit: "minutes", required: true, customizable: true, days: [1, 2, 3, 4, 5] },
      { key: "plan", title: "Plan tomorrow", kind: "checkbox", required: false, customizable: true, days: [1, 2, 3, 4, 5] },
    ],
  },
  {
    slug: "morning-routine-14",
    title: "Morning Routine",
    description: `Two weeks to settle into a calm start: up on time and a short stretch. ${DEFAULTS_NOTE}`,
    category: "wellness",
    difficulty: "easy",
    durationDays: 14,
    activities: [
      { key: "wake", title: "Up at your planned time", kind: "checkbox", required: true },
      { key: "stretch", title: "Stretch", kind: "numeric", target: 10, unit: "minutes", required: false, customizable: true },
    ],
  },
];

module.exports = { BUILT_IN_TEMPLATES };
