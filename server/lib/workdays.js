import { addDays, isoWeekday } from './dates.js';

// Swedish working days, for statutory deadlines such as reporting hazardous waste
// "within two working days". Non-working days follow lag (1930:173) om beräkning av
// lagstadgad tid: Saturdays, Sundays, public holidays (lag 1989:253 om allmänna helgdagar),
// midsommarafton, julafton and nyårsafton.

/** Easter Sunday for a Gregorian year (anonymous Gregorian algorithm), as 'YYYY-MM-DD'. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** First date on or after `from` that falls on ISO weekday `wd` (1 = Monday … 7 = Sunday). */
function weekdayOnOrAfter(from, wd) {
  return addDays(from, (wd - isoWeekday(from) + 7) % 7);
}

const cache = new Map();

/** Map of 'YYYY-MM-DD' → Swedish name for every weekday-independent non-working day of the year. */
export function swedishHolidays(year) {
  if (cache.has(year)) return cache.get(year);
  const y = String(year);
  const easter = easterSunday(year);
  const days = new Map([
    [`${y}-01-01`, 'Nyårsdagen'],
    [`${y}-01-06`, 'Trettondedag jul'],
    [addDays(easter, -2), 'Långfredagen'],
    [easter, 'Påskdagen'],
    [addDays(easter, 1), 'Annandag påsk'],
    [`${y}-05-01`, 'Första maj'],
    [addDays(easter, 39), 'Kristi himmelsfärdsdag'],
    [addDays(easter, 49), 'Pingstdagen'],
    [`${y}-06-06`, 'Sveriges nationaldag'],
    [weekdayOnOrAfter(`${y}-06-19`, 5), 'Midsommarafton'],
    [weekdayOnOrAfter(`${y}-06-20`, 6), 'Midsommardagen'],
    [weekdayOnOrAfter(`${y}-10-31`, 6), 'Alla helgons dag'],
    [`${y}-12-24`, 'Julafton'],
    [`${y}-12-25`, 'Juldagen'],
    [`${y}-12-26`, 'Annandag jul'],
    [`${y}-12-31`, 'Nyårsafton'],
  ]);
  cache.set(year, days);
  return days;
}

export function isWorkday(date) {
  return isoWeekday(date) <= 5 && !swedishHolidays(Number(date.slice(0, 4))).has(date);
}

/** The n-th working day after `date` (n ≥ 1). `date` itself is never counted. */
export function addWorkdays(date, n) {
  let d = date;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkday(d)) left--;
  }
  return d;
}

/** Hazardous waste must be reported to Naturvårdsverket's avfallsregister within two working days of the transport. */
export const HAZARD_REPORT_WORKDAYS = 2;

/**
 * Reporting status of a hazardous-waste lass transported on `datum`.
 * Returns { deadline, state } where state is 'rapporterad' | 'forsenad' | 'idag' | 'kommande'.
 */
export function hazardDeadline(datum, today, reportedAt = null) {
  const deadline = addWorkdays(datum, HAZARD_REPORT_WORKDAYS);
  const state = reportedAt ? 'rapporterad' : today > deadline ? 'forsenad' : today === deadline ? 'idag' : 'kommande';
  return { deadline, state };
}
