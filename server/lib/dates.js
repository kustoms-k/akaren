// Business dates are local Europe/Stockholm calendar dates ('YYYY-MM-DD').
// Week maths uses ISO-8601 weeks (Monday–Sunday, week 1 contains the first Thursday).

export const TIME_ZONE = 'Europe/Stockholm';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const DAY_MS = 86_400_000;

const stockholmDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const stockholmTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Local Stockholm date for an instant, as 'YYYY-MM-DD'. */
export function stockholmDate(instant = new Date()) {
  return stockholmDateFmt.format(instant);
}

/** Local Stockholm time for an instant, as 'HH:MM'. */
export function stockholmTime(instant = new Date()) {
  return stockholmTimeFmt.format(instant);
}

export function isValidDate(str) {
  const m = DATE_RE.exec(str ?? '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUtcDay(str) {
  if (!isValidDate(str)) throw new RangeError(`Invalid date: ${str}`);
  const [y, mo, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

function fromUtcDay(date) {
  return date.toISOString().slice(0, 10);
}

/** Add whole days to a 'YYYY-MM-DD' date. */
export function addDays(str, days) {
  return fromUtcDay(new Date(toUtcDay(str).getTime() + days * DAY_MS));
}

/** Add whole months to a 'YYYY-MM-DD' date; the day is clamped to the target month ('2026-03-31' - 1 → '2026-02-28'). */
export function addMonths(str, months) {
  const d = toUtcDay(str);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUtcDay(new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay))));
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(str) {
  return toUtcDay(str).getUTCDay() || 7;
}

/** ISO week of a date, as { year, week, key: 'YYYY-Www' }. */
export function isoWeek(str) {
  const d = toUtcDay(str);
  // Thursday of the same ISO week decides the week-numbering year.
  const thursday = new Date(d.getTime() + (4 - (d.getUTCDay() || 7)) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return { year, week, key: `${year}-W${String(week).padStart(2, '0')}` };
}

/** Monday–Sunday date range for an ISO week key 'YYYY-Www'. */
export function isoWeekRange(key) {
  const m = WEEK_RE.exec(key ?? '');
  if (!m) throw new RangeError(`Invalid ISO week: ${key}`);
  const year = +m[1];
  const week = +m[2];
  // Jan 4 is always in week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY_MS);
  const monday = new Date(week1Monday.getTime() + (week - 1) * 7 * DAY_MS);
  const from = fromUtcDay(monday);
  if (week < 1 || isoWeek(from).key !== key) throw new RangeError(`Invalid ISO week: ${key}`);
  return { from, to: addDays(from, 6) };
}

/** Stockholm local date + 'HH:MM' → UTC ISO timestamp (handles CET/CEST). */
export function stockholmLocalToUtc(date, time = '00:00') {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  for (const offsetHours of [1, 2]) {
    const instant = new Date(Date.UTC(y, mo - 1, d, h - offsetHours, mi));
    if (stockholmDate(instant) === date && stockholmTime(instant) === time) return instant.toISOString();
  }
  // Non-existent local time (spring-forward gap): fall back to CET.
  return new Date(Date.UTC(y, mo - 1, d, h - 1, mi)).toISOString();
}

/** UTC ISO timestamp of 00:00 on the first day of the current Stockholm month. */
export function stockholmMonthStartUtc(instant = new Date()) {
  return stockholmLocalToUtc(`${stockholmDate(instant).slice(0, 7)}-01`, '00:00');
}

/** ISO week key for the current Stockholm date. */
export function currentIsoWeek(instant = new Date()) {
  return isoWeek(stockholmDate(instant)).key;
}
