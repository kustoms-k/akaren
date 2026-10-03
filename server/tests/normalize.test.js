import { describe, it, expect } from 'vitest';
import { luhnValid, normalizeOrgNr, normalizeRegnr, normalizePhone, formatPhoneSv } from '../lib/normalize.js';

describe('normalizeOrgNr', () => {
  it('accepts valid numbers in any common format', () => {
    expect(normalizeOrgNr('559101-2348')).toBe('559101-2348');
    expect(normalizeOrgNr('5591012348')).toBe('559101-2348');
    expect(normalizeOrgNr('16559101-2348')).toBe('559101-2348');
    expect(normalizeOrgNr(' 559101 2348 ')).toBe('559101-2348');
  });

  it('rejects bad checksums and lengths', () => {
    expect(normalizeOrgNr('559101-2349')).toBeNull();
    expect(normalizeOrgNr('55910-12348')).toBe('559101-2348'); // digits are what count
    expect(normalizeOrgNr('559101-234')).toBeNull();
    expect(normalizeOrgNr(null)).toBeNull();
  });

  it('luhn', () => {
    expect(luhnValid('5590000013')).toBe(true);
    expect(luhnValid('5590000014')).toBe(false);
  });
});

describe('normalizeRegnr', () => {
  it('uppercases and strips spaces', () => {
    expect(normalizeRegnr('tka 412')).toBe('TKA412');
    expect(normalizeRegnr('MXR27C')).toBe('MXR27C');
    expect(normalizeRegnr('MXR-27C')).toBe('MXR27C');
  });
  it('rejects other shapes', () => {
    expect(normalizeRegnr('AB123')).toBeNull();
    expect(normalizeRegnr('1234567')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('converts Swedish numbers to E.164', () => {
    expect(normalizePhone('070-174 06 05')).toBe('+46701740605');
    expect(normalizePhone('+46 70 174 06 05')).toBe('+46701740605');
    expect(normalizePhone('0046701740605')).toBe('+46701740605');
  });
  it('keeps foreign E.164 numbers', () => {
    expect(normalizePhone('+48 601 234 567')).toBe('+48601234567');
  });
  it('rejects junk', () => {
    expect(normalizePhone('ring kontoret')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
  it('formats for display', () => {
    expect(formatPhoneSv('+46701740605')).toBe('070-174 06 05');
    expect(formatPhoneSv('+48601234567')).toBe('+48601234567');
  });
});
