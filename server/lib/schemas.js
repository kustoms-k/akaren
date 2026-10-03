import { z } from 'zod';
import { normalizeOrgNr, normalizePhone, normalizeRegnr } from './normalize.js';
import { isValidDate } from './dates.js';

// Shared zod building blocks with Swedish, user-facing error messages.

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const requiredText = (max = 200) =>
  z.string({ error: 'Obligatoriskt.' }).trim().min(1, 'Obligatoriskt.').max(max, `Högst ${max} tecken.`);

export const optionalText = (max = 200) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `Högst ${max} tecken.`).nullable().optional());

export const orgNr = z.preprocess(
  blankToNull,
  z.string().nullable().optional()
    .transform((v, ctx) => {
      if (v == null) return v;
      const n = normalizeOrgNr(v);
      if (!n) ctx.addIssue({ code: 'custom', message: 'Ogiltigt organisationsnummer.' });
      return n;
    }),
);

export const phone = z.preprocess(
  blankToNull,
  z.string().nullable().optional()
    .transform((v, ctx) => {
      if (v == null) return v;
      const n = normalizePhone(v);
      if (!n) ctx.addIssue({ code: 'custom', message: 'Ogiltigt telefonnummer.' });
      return n;
    }),
);

export const requiredPhone = z.string({ error: 'Obligatoriskt.' }).transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Ogiltigt telefonnummer.' });
  return n;
});

export const regnr = z.string({ error: 'Obligatoriskt.' }).transform((v, ctx) => {
  const n = normalizeRegnr(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Ogiltigt registreringsnummer (t.ex. ABC123).' });
  return n;
});

export const email = z.preprocess(
  blankToNull,
  z.email('Ogiltig e-postadress.').max(320).nullable().optional(),
);

export const postnr = z.preprocess(
  (v) => (typeof v === 'string' ? (v.replace(/\s/g, '') || null) : v),
  z.string().regex(/^\d{5}$/, 'Postnummer ska vara fem siffror.').nullable().optional(),
);

export const date = z.string({ error: 'Obligatoriskt.' }).refine(isValidDate, 'Ogiltigt datum (ÅÅÅÅ-MM-DD).');

export const bool01 = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v ? 1 : 0));

export const zoneClass = z.coerce.number().int().min(0, 'Välj 0–3.').max(3, 'Välj 0–3.');

export const idRef = z.coerce.number().int().positive();

/** Format a stored 'NNNNN' postnummer for display: '11340' -> '113 40'. */
export const formatPostnr = (p) => (p && /^\d{5}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3)}` : p ?? null);
