import { addDays, stockholmLocalToUtc } from './dates.js';

// ── Driver magic links ──────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;

/**
 * A link is valid until the end of the day after the driver's last assigned date,
 * at least 12 hours from now, and never longer than maxDays.
 */
export function linkExpiry({ now, lastAssignedDate, maxDays }) {
  const cap = now.getTime() + maxDays * 24 * HOUR_MS;
  const floor = now.getTime() + 12 * HOUR_MS;
  const endOfNextDay = lastAssignedDate ? Date.parse(stockholmLocalToUtc(addDays(lastAssignedDate, 2), '00:00')) : floor;
  return new Date(Math.min(cap, Math.max(floor, endOfNextDay))).toISOString();
}

// ── SMS text ────────────────────────────────────────────────────────────────

// GSM 03.38 basic character set (+ the common extension characters). Anything else forces
// UCS-2 encoding, which cuts an SMS segment from 160 to 70 characters.
const GSM = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
  + '^{}\\[~]|€',
);
const REPLACE = { '–': '-', '—': '-', '’': "'", '‘': "'", '´': "'", '`': "'", '“': '"', '”': '"', '„': '"', '…': '...', '×': 'x', '³': '3', '²': '2', ' ': ' ', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D' };

function toGsm(ch) {
  if (GSM.has(ch)) return ch;
  if (REPLACE[ch]) return REPLACE[ch];
  const base = ch.normalize('NFD')[0]; // e.g. 'ł' stays unknown, 'ó' -> 'o'
  return GSM.has(base) ? base : '?';
}

/** Replace characters outside the GSM alphabet so the SMS stays in 160-char segments. */
export function gsmSafe(text) {
  return [...String(text)].map(toGsm).join('');
}

const WEEKDAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function shortDateSv(date) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]}`;
}

const cut = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}.` : s);

/** The assignment SMS. Kept GSM-safe and within two SMS segments (306 chars). */
export function buildAssignmentSms({ driverName, datum, tid, typeLabel, projectName, address, regnr, link, companyName }) {
  const first = (driverName ?? '').split(' ')[0];
  const when = `${shortDateSv(datum)}${tid ? ` kl ${tid}` : ''}`;
  const where = [cut(projectName, 40), cut(address, 40)].filter(Boolean).join(', ');
  const text = `Hej ${first}! Uppdrag ${when} med ${regnr}: ${typeLabel}, ${where}. Info och lassrapport: ${link} /${cut(companyName, 24)}`;
  return gsmSafe(text);
}

export const TYPE_LABELS = {
  schakt: 'Schakt',
  grus_leverans: 'Grusleverans',
  kran: 'Kran',
  container: 'Container',
  maskintransport: 'Maskintransport',
  ovrigt: 'Övrigt',
};

/** Miljözon: does this vehicle meet the project's zone class? */
export function miljozonOk(vehicleClass, projectZone) {
  return !projectZone || vehicleClass >= projectZone;
}
