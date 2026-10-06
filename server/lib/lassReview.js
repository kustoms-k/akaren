// Decides whether a reported lass can go straight to fakturaunderlag ('ok')
// or must be reviewed by the office first ('behover_granskas').

export const BILLING_FIELDS = {
  datum: 'Datum',
  vagsedel_nr: 'Vågsedelnummer',
  netto_kg: 'Nettovikt',
  material: 'Material',
};

export const REGNR_MISMATCH_REASON = 'Annat regnr på vågsedeln';

// Confidence values that need no review. 'forare'/'kontor' = typed or corrected by a person.
const TRUSTED = new Set(['hog', 'medel', 'forare', 'kontor']);

/**
 * confidence: { field: 'hog'|'medel'|'lag'|'saknas'|'forare'|'kontor' }
 * fromWeighList: the lass was created from the receiving facility's weighing list, which is its evidence instead
 * of a photo of the ticket.
 * Returns { status, reasons } where reasons are Swedish, user-facing strings.
 */
export function reviewStatusFor({ confidence = {}, hasPhoto, fromWeighList = false, duplicate = false, farligtAvfall = false, regnrMismatch = false }) {
  const reasons = [];
  if (!hasPhoto && !fromWeighList) reasons.push('Inget foto på vågsedeln');
  for (const [key, label] of Object.entries(BILLING_FIELDS)) {
    const c = confidence[key] ?? 'saknas';
    if (c === 'saknas') reasons.push(`${label} saknas`);
    else if (!TRUSTED.has(c)) reasons.push(`${label} osäker`);
  }
  if (duplicate) reasons.push('Vågsedelnumret är redan rapporterat');
  if (regnrMismatch) reasons.push(REGNR_MISMATCH_REASON);
  if (farligtAvfall) reasons.push('Farligt avfall');
  return { status: reasons.length ? 'behover_granskas' : 'ok', reasons };
}

// AI vågsedel field -> lass field
export const VAGSEDEL_TO_LASS = {
  vagsedel_nr: 'vagsedel_nr',
  datum: 'datum',
  tid: 'tid',
  material: 'material',
  netto_kg: 'netto_kg',
  avfallskod: 'avfallskod',
  farligt_avfall: 'farligt_avfall',
  lastplats: 'fran_text',
  mottagare: 'till_namn',
  mottagare_orgnr: 'till_orgnr',
  mottagare_adress: 'till_adress',
};

export const LASS_FIELDS = ['vagsedel_nr', 'datum', 'tid', 'material', 'netto_kg', 'avfallskod', 'farligt_avfall',
  'fran_text', 'till_namn', 'till_orgnr', 'till_adress'];

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * Per-field confidence for a submitted lass. A value equal to what the AI read keeps the AI's
 * confidence; a value the person typed or changed gets `personKind` ('forare' or 'kontor');
 * an empty value is 'saknas'.
 */
export function submittedConfidence(submitted, aiFields, personKind) {
  const out = {};
  const aiByLass = {};
  for (const [aiKey, lassKey] of Object.entries(VAGSEDEL_TO_LASS)) if (aiFields?.[aiKey]) aiByLass[lassKey] = aiFields[aiKey];
  for (const key of LASS_FIELDS) {
    const v = submitted[key];
    if (v == null || v === '') { out[key] = 'saknas'; continue; }
    const ai = aiByLass[key];
    out[key] = ai && ai.value != null && same(ai.value, v) ? ai.confidence : personKind;
  }
  return out;
}
