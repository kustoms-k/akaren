// Normalisers return a canonical string, or null when the input can't be made valid.

/** Luhn (mod 10) check over a string of digits, as used by Swedish org/personnummer. */
export function luhnValid(digits) {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Swedish organisationsnummer → 'NNNNNN-NNNN'. Accepts a '16' century prefix. */
export function normalizeOrgNr(input) {
  if (input == null) return null;
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('16')) digits = digits.slice(2);
  if (digits.length !== 10 || !luhnValid(digits)) return null;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

/** Swedish registration number → uppercase without spaces, e.g. 'ABC123' or 'ABC12D'. */
export function normalizeRegnr(input) {
  if (input == null) return null;
  const s = String(input).toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z]{3}\d{2}[A-Z0-9]$/.test(s) ? s : null;
}

/** Phone number → E.164. Swedish national format (leading 0) becomes +46. */
export function normalizePhone(input) {
  if (input == null) return null;
  let s = String(input).trim().replace(/[\s\-()./]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (s.startsWith('0')) s = `+46${s.slice(1)}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

/** Display form of an E.164 Swedish mobile number: '+46701234567' → '070-123 45 67'. */
export function formatPhoneSv(e164) {
  if (!e164) return '';
  const m = /^\+46(7\d)(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (m) return `0${m[1]}-${m[2]} ${m[3]} ${m[4]}`;
  const sthlm = /^\+468(\d{3})(\d{3})(\d{2})$/.exec(e164); // Stockholm landline, 08-xxx xxx xx
  return sthlm ? `08-${sthlm[1]} ${sthlm[2]} ${sthlm[3]}` : e164;
}
