import { describe, it, expect } from 'vitest';
import { easterSunday, swedishHolidays, isWorkday, addWorkdays, hazardDeadline } from '../lib/workdays.js';
import { addMonths } from '../lib/dates.js';

describe('easterSunday', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2038, '2038-04-25'],
  ])('%i → %s', (year, date) => {
    expect(easterSunday(year)).toBe(date);
  });
});

describe('swedishHolidays', () => {
  it('lists the movable and fixed days for 2026', () => {
    const h = swedishHolidays(2026);
    expect(h.get('2026-04-03')).toBe('Långfredagen');
    expect(h.get('2026-04-06')).toBe('Annandag påsk');
    expect(h.get('2026-05-14')).toBe('Kristi himmelsfärdsdag');
    expect(h.get('2026-05-24')).toBe('Pingstdagen');
    expect(h.get('2026-06-19')).toBe('Midsommarafton');
    expect(h.get('2026-06-20')).toBe('Midsommardagen');
    expect(h.get('2026-10-31')).toBe('Alla helgons dag');
    expect(h.get('2026-12-24')).toBe('Julafton');
    expect(h.get('2026-12-31')).toBe('Nyårsafton');
  });

  it('puts midsommarafton on the Friday between 19 and 25 June', () => {
    expect(swedishHolidays(2027).get('2027-06-25')).toBe('Midsommarafton');
    expect(swedishHolidays(2028).get('2028-06-23')).toBe('Midsommarafton');
  });
});

describe('isWorkday', () => {
  it('excludes weekends, public holidays and the three aftnar', () => {
    expect(isWorkday('2026-10-05')).toBe(true);   // Monday
    expect(isWorkday('2026-10-03')).toBe(false);  // Saturday
    expect(isWorkday('2026-10-04')).toBe(false);  // Sunday
    expect(isWorkday('2026-06-19')).toBe(false);  // midsommarafton
    expect(isWorkday('2026-05-01')).toBe(false);  // Friday, första maj
    expect(isWorkday('2026-06-05')).toBe(true);   // the day before nationaldagen
  });
});

describe('addWorkdays', () => {
  it.each([
    ['2026-10-05', '2026-10-07', 'Monday → Wednesday'],
    ['2026-10-01', '2026-10-05', 'Thursday → Monday over the weekend'],
    ['2026-10-02', '2026-10-06', 'Friday → Tuesday'],
    ['2026-10-03', '2026-10-06', 'a Saturday transport counts from Monday'],
    ['2026-04-02', '2026-04-08', 'skärtorsdag → past långfredag and annandag påsk'],
    ['2026-12-23', '2026-12-29', 'past julafton, juldagen and annandag jul'],
    ['2026-06-18', '2026-06-23', 'past midsommar'],
    ['2026-12-30', '2027-01-05', 'past nyårsafton and nyårsdagen into a new year'],
    ['2027-01-04', '2027-01-07', 'past trettondedag jul'],
  ])('%s + 2 = %s (%s)', (from, to) => {
    expect(addWorkdays(from, 2)).toBe(to);
  });
});

describe('hazardDeadline', () => {
  it('reports the deadline and the state relative to today', () => {
    expect(hazardDeadline('2026-10-02', '2026-10-05')).toEqual({ deadline: '2026-10-06', state: 'kommande' });
    expect(hazardDeadline('2026-10-02', '2026-10-06')).toEqual({ deadline: '2026-10-06', state: 'idag' });
    expect(hazardDeadline('2026-10-02', '2026-10-07')).toEqual({ deadline: '2026-10-06', state: 'forsenad' });
    expect(hazardDeadline('2026-10-02', '2026-10-09', '2026-10-05').state).toBe('rapporterad');
  });
});

describe('addMonths', () => {
  it('clamps the day to the target month and crosses years', () => {
    expect(addMonths('2026-10-05', -36)).toBe('2023-10-05');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
});
