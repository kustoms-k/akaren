import { normalizeOrgNr } from './normalize.js';

// Suggests existing customers and projects for an order. Suggestions only:
// the office user always picks (or creates) the customer and project.

const LEGAL_SUFFIXES = /\b(ab|aktiebolag|hb|kb|handelsbolag|publ|ek för|ekonomisk förening)\b/g;
// Words too common in this trade to identify a company on their own.
const GENERIC = new Set([
  'bygg', 'mark', 'anlaggning', 'entreprenad', 'entreprenader', 'fastighet', 'fastigheter', 'fastighetsutveckling',
  'schakt', 'transport', 'transporter', 'akeri', 'stockholm', 'sverige', 'och', 'i', 'service', 'gruppen', 'group',
]);
export const FREE_MAIL = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'live.se', 'telia.com', 'icloud.com', 'yahoo.com', 'hotmail.se', 'outlook.se']);

const fold = (s) => s.toLowerCase()
  .replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[éè]/g, 'e').replace(/ü/g, 'u');

export function normalizeName(s) {
  if (!s) return '';
  return fold(String(s))
    .replace(/&/g, ' ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function trigrams(s) {
  const padded = `  ${s} `;
  const set = new Set();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}

/** Dice coefficient on character trigrams, 0..1. */
export function similarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = trigrams(na);
  const tb = trigrams(nb);
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return (2 * common) / (ta.size + tb.size);
}

/** 0.85 when every distinctive word of the shorter name appears in the longer one ("Norrbacka" ~ "Norrbacka Mark AB"). */
function containment(a, b) {
  const wa = normalizeName(a).split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w));
  const wb = new Set(normalizeName(b).split(' '));
  if (wa.length === 0) return 0;
  return wa.every((w) => wb.has(w)) ? 0.85 : 0;
}

export function nameScore(a, b) {
  return Math.max(similarity(a, b), containment(a, b), containment(b, a));
}

/** Street name + number, folded: 'Rörstrandsgatan 40 B, Stockholm' -> { street: 'rorstrandsgatan', number: '40b' }. */
export function parseStreet(address) {
  if (!address) return null;
  const first = fold(String(address)).split(',')[0];
  const m = /^\s*([a-z][a-z .-]*?)\s+(\d+)\s*([a-z])?\b/.exec(first);
  if (!m) return { street: first.replace(/[^a-z]+/g, ''), number: null };
  return { street: m[1].replace(/[^a-z]+/g, ''), number: `${m[2]}${m[3] ?? ''}` };
}

export function addressScore(a, b) {
  const pa = parseStreet(a);
  const pb = parseStreet(b);
  if (!pa?.street || !pb?.street || pa.street !== pb.street) return 0;
  if (pa.number && pb.number) return pa.number === pb.number ? 0.95 : 0.4;
  return 0.6;
}

const emailDomains = (text) => new Set(
  [...String(text ?? '').toLowerCase().matchAll(/@([a-z0-9.-]+\.[a-z]{2,})/g)].map((m) => m[1]),
);

function refInText(ref, text) {
  if (!ref || ref.length < 3) return false;
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text ?? '');
}

const SUGGEST_MIN = 0.45;
const top = (list, n = 3) => list.filter((s) => s.score >= SUGGEST_MIN).sort((a, b) => b.score - a.score).slice(0, n);

/**
 * Rank existing customers and projects against extracted order fields and the raw text.
 * Returns { customers: [...], projects: [...] }, each item with { score (0..1), reasons: [sv] }.
 */
export function suggestMatches({ customers, projects, fields, rawText }) {
  const v = (k) => fields?.[k]?.value ?? null;
  const orgNr = normalizeOrgNr(v('kund_orgnr'));
  const domains = emailDomains(rawText);

  const projectScores = projects.map((p) => {
    const reasons = [];
    let score = 0;
    const bump = (s, reason) => { if (s > 0) { score = Math.max(score, s); reasons.push(reason); } };
    if (refInText(p.customer_ref, rawText)) bump(0.95, `Referensen ${p.customer_ref} finns i texten`);
    const addr = addressScore(v('adress'), p.address);
    if (addr >= 0.6) bump(addr, addr >= 0.95 ? 'Samma adress' : 'Samma gata');
    const name = nameScore(v('projekt'), p.name);
    if (name >= 0.5) bump(name, 'Projektnamnet liknar');
    return { project: p, score, reasons };
  });

  const customerScores = customers.map((c) => {
    const reasons = [];
    let score = 0;
    const bump = (s, reason) => { if (s > 0) { score = Math.max(score, s); reasons.push(reason); } };
    if (orgNr && c.org_nr === orgNr) bump(1, 'Samma organisationsnummer');
    const domain = c.email?.split('@')[1]?.toLowerCase();
    if (domain && !FREE_MAIL.has(domain) && domains.has(domain)) bump(0.85, `E-post från @${domain}`);
    const name = nameScore(v('kund'), c.name);
    if (name >= 0.45) bump(name, 'Namnet liknar');
    const viaProject = projectScores
      .filter((ps) => ps.project.customer_id === c.id && ps.score >= 0.9)
      .sort((a, b) => b.score - a.score)[0];
    if (viaProject) bump(0.8, `Projektet ${viaProject.project.name} matchar`);
    return { customer: c, score, reasons };
  });

  // A project of a likely customer is a little more likely.
  const customerScore = new Map(customerScores.map((cs) => [cs.customer.id, cs.score]));
  for (const ps of projectScores) {
    if (ps.score > 0 && (customerScore.get(ps.project.customer_id) ?? 0) >= 0.8) ps.score = Math.min(1, ps.score + 0.05);
  }

  return {
    customers: top(customerScores).map(({ customer: c, score, reasons }) => ({
      id: c.id, name: c.name, org_nr: c.org_nr, score: Math.round(score * 100) / 100, reasons,
    })),
    projects: top(projectScores, 5).map(({ project: p, score, reasons }) => ({
      id: p.id, name: p.name, customer_id: p.customer_id, customer_name: p.customer_name,
      address: p.address, customer_ref: p.customer_ref, miljozon: p.miljozon,
      score: Math.round(score * 100) / 100, reasons,
    })),
  };
}

/** The suggestion to pre-select: confident and clearly ahead of the runner-up. */
export function confidentPick(list) {
  if (!list?.length) return null;
  const [first, second] = list;
  return first.score >= 0.8 && (!second || first.score - second.score >= 0.15) ? first : null;
}

/** Existing names that are probably the same company/project as `name` (duplicate guard). */
export function similarNames(name, candidates, threshold = 0.85) {
  return candidates
    .map((c) => ({ ...c, score: nameScore(name, c.name) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
