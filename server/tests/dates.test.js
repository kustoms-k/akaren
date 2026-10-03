import { describe, it, expect } from 'vitest';
import { isoWeek, isoWeekRange, isoWeekday, addDays, stockholmDate, stockholmTime, isValidDate } from '../lib/dates.js';

describe('isoWeek', () => {
  it.each([
    ['2026-10-03', '2026-W40'],   // Saturday
    ['2026-09-28', '2026-W40'],   // Monday
    ['2026-10-04', '2026-W40'],   // Sunday still belongs to the same week
    ['2026-10-05', '2026-W41'],
    ['2025-12-29', '2026-W01'],   // Monday before New Year belongs to next year's week 1
    ['2026-01-01', '2026-W01'],
    ['2026-12-31', '2026-W53'],   // 2026 starts on a Thursday, so it has 53 weeks
    ['2027-01-03', '2026-W53'],
    ['2027-01-04', '2027-W01'],
    ['2021-01-03', '2020-W53'],
    ['2024-12-30', '2025-W01'],
  ])('%s is in %s', (date, key) => {
    expect(isoWeek(date).key).toBe(key);
  });
});

describe('isoWeekRange', () => {
  it('returns Monday to Sunday', () => {
    expect(isoWeekRange('2026-W40')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(isoWeekRange('2026-W01')).toEqual({ from: '2025-12-29', to: '2026-01-04' });
    expect(isoWeekRange('2026-W53')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('rejects weeks that do not exist', () => {
    expect(() => isoWeekRange('2025-W53')).toThrow(RangeError);
    expect(() => isoWeekRange('2026-W00')).toThrow(RangeError);
    expect(() => isoWeekRange('2026-40')).toThrow(RangeError);
  });

  it('round-trips with isoWeek for every day of a year', () => {
    for (let d = '2026-01-01'; d <= '2027-01-10'; d = addDays(d, 1)) {
      const { from, to } = isoWeekRange(isoWeek(d).key);
      expect(d >= from && d <= to).toBe(true);
      expect(isoWeekday(from)).toBe(1);
    }
  });
});

describe('Stockholm local time', () => {
  it('uses the local date, not the UTC date, around midnight', () => {
    // 22:30 UTC on 3 Oct is 00:30 on 4 Oct in Stockholm (CEST, UTC+2).
    expect(stockholmDate(new Date('2026-10-03T22:30:00Z'))).toBe('2026-10-04');
    // Winter time (CET, UTC+1).
    expect(stockholmDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(stockholmTime(new Date('2026-12-31T23:30:00Z'))).toBe('00:30');
  });
});

describe('date helpers', () => {
  it('validates calendar dates', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-9-1')).toBe(false);
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
