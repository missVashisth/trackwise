// Small input helpers shared by controllers. Each returns a clean value or null/undefined
// so controllers can reply with a 400 before anything reaches MongoDB.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** true/false, or the strings "true"/"false"; anything else -> null. */
function parseBoolean(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

/** A finite number above 0 (numeric strings allowed); anything else -> null. */
function parsePositiveNumber(value) {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim() !== "")) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** "YYYY-MM-DD" that is also a real calendar date (rejects 2026-13-45, 2026-02-30). */
function isValidDateKey(value) {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Mongoose errors caused by bad client input are 400s; everything else stays a 500. */
function statusForError(err) {
  return err?.name === "ValidationError" || err?.name === "CastError" ? 400 : 500;
}

module.exports = {
  isNonEmptyString,
  parseBoolean,
  parsePositiveNumber,
  isValidDateKey,
  statusForError,
};
