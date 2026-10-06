import { formatDate } from './labels.js';

// Local (Europe/Stockholm) business dates as 'YYYY-MM-DD', like the server's.

export const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(new Date());

/** '2026-10-06' + n days. */
export function shiftDate(datum, n) {
  const t = new Date(`${datum}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** 'Idag' / 'Imorgon' / 'Igår' / 'tis 6 okt'. */
export function dayName(datum) {
  const today = todayLocal();
  if (datum === today) return 'Idag';
  if (datum === shiftDate(today, 1)) return 'Imorgon';
  if (datum === shiftDate(today, -1)) return 'Igår';
  return formatDate(datum);
}
