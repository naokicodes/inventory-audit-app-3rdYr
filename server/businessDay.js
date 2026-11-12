// Step business-day: the one 8am business date for the whole app (ADR-036,
// widens ADR-033). A business day runs 08:00 to 07:59:59 the next morning,
// Manila time, so a night that counts until 1am stays on one date. Pure and
// dependency-free: callers pass the instant, nothing reads the clock here.

const TIMEZONE = 'Asia/Manila';
// 07:59:59 is the previous day; 08:00:00 is the new one.
const BUSINESS_DAY_START_HOUR = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

const manilaDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

// Calendar date (YYYY-MM-DD) of an instant, in Asia/Manila.
function manilaDate(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return manilaDateFormat.format(d);
}

// Business date of an instant: the Manila date of (instant minus 8 hours).
// Classifies a receipt (receipt_date) and gives "today's business date" for a
// `now` (before 8am Manila -> yesterday).
function businessDate(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return manilaDate(d.getTime() - BUSINESS_DAY_START_HOUR * 60 * 60 * 1000);
}

// The Monday (YYYY-MM-DD) of a date's week; weeks run Monday to Sunday
// (ADR-013). A Monday returns itself, a Sunday the Monday six days before.
// Not a real YYYY-MM-DD date -> null.
function mondayOf(dateString) {
  if (typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const d = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dateString) return null;
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - daysSinceMonday * DAY_MS).toISOString().slice(0, 10);
}

module.exports = { manilaDate, businessDate, mondayOf, BUSINESS_DAY_START_HOUR };
