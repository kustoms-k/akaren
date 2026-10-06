import { addDays, isoWeek, isoWeekRange } from './dates.js';

// ISO-8601 weeks (Monday–Sunday, local Stockholm dates) for the weekly fakturaunderlag.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** True for a real ISO week key like '2026-W41' (week 53 only in years that have it). */
export function isValidWeek(key) {
  try { isoWeekRange(key); return true; } catch { return false; }
}

/** The week `n` weeks after `key` (negative for earlier). Crosses year boundaries. */
export function shiftWeek(key, n) {
  return isoWeek(addDays(isoWeekRange(key).from, 7 * n)).key;
}

/** The week a local date falls in. */
export const weekOf = (date) => isoWeek(date).key;

/** 'v. 41 · 5–11 okt 2026'; spans months and years when the week does. */
export function weekLabel(key) {
  const { from, to } = isoWeekRange(key);
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const week = Number(key.slice(6));
  const span = fy !== ty ? `${fd} ${MONTHS[fm - 1]} ${fy} – ${td} ${MONTHS[tm - 1]} ${ty}`
    : fm !== tm ? `${fd} ${MONTHS[fm - 1]} – ${td} ${MONTHS[tm - 1]} ${ty}`
      : `${fd}–${td} ${MONTHS[tm - 1]} ${ty}`;
  return `v. ${week} · ${span}`;
}
