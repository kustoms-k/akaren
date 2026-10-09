import { describe, it, expect } from 'vitest';
import { foundValue } from '../lib/foundValue.js';

// 132 kr/t on job 1; job 2 is billed per hour, so its lass can't be valued.
const valueOf = (item, kg) => (item.job_id === 1 && kg != null ? Math.round((13200 * kg) / 1000) : null);
const base = { customer_name: 'Norrbacka', project_name: 'Kv. Rörstrand', facility_name: 'Ekbacka', material: 'Schaktmassor' };

describe('foundValue', () => {
  it('values a created lass at its invoice line when invoiced, else at its estimate', () => {
    const r = foundValue({
      created: [
        { ...base, lass_id: 10, job_id: 1, found_at: '2026-10-05T08:00:00.000Z', datum: '2026-10-01', netto_kg: 18000, invoiced_ore: null },
        { ...base, lass_id: 11, job_id: 1, found_at: '2026-10-06T08:00:00.000Z', datum: '2026-10-02', netto_kg: 17000, invoiced_ore: 250000 },
      ],
      corrections: [],
      valueOf,
      today: '2026-10-09',
    });
    expect(r.items.map((i) => [i.lass_id, i.value_ore, i.invoiced])).toEqual([[11, 250000, true], [10, 237600, false]]);
    expect(r.totals).toMatchObject({ value_ore: 487600, lass: 2, lass_value_ore: 487600, unpriced: 0 });
  });

  it('counts a lass it can\'t price without adding a guess', () => {
    const r = foundValue({
      created: [{ ...base, lass_id: 12, job_id: 2, found_at: '2026-10-05T08:00:00.000Z', datum: '2026-10-01', netto_kg: 18000, invoiced_ore: null }],
      corrections: [],
      valueOf,
      today: '2026-10-09',
    });
    expect(r.items[0].value_ore).toBeNull();
    expect(r.totals).toMatchObject({ value_ore: 0, lass: 1, unpriced: 1 });
  });

  it('values a weight corrected upwards at the extra weight, and counts one corrected downwards at zero', () => {
    const r = foundValue({
      created: [],
      corrections: [
        { ...base, lass_id: 20, job_id: 1, found_at: '2026-10-07T08:00:00.000Z', datum: '2026-10-01', from_kg: 18000, to_kg: 18240 },
        { ...base, lass_id: 21, job_id: 1, found_at: '2026-10-07T09:00:00.000Z', datum: '2026-10-01', from_kg: 18000, to_kg: 17500 },
      ],
      valueOf,
      today: '2026-10-09',
    });
    const up = r.items.find((i) => i.lass_id === 20);
    expect(up).toMatchObject({ kind: 'vikt_upp', from_kg: 18000, to_kg: 18240, value_ore: 240768 - 237600 });
    expect(r.items.find((i) => i.lass_id === 21)).toMatchObject({ kind: 'vikt_ned', value_ore: 0 });
    expect(r.totals).toMatchObject({ value_ore: 3168, weight_up: 1, weight_up_value_ore: 3168, weight_down: 1, unpriced: 0 });
  });

  it('totals the month in Stockholm time and reports the first find', () => {
    const r = foundValue({
      created: [
        // 23:30 UTC on 30 September is 01:30 on 1 October in Stockholm: this month.
        { ...base, lass_id: 30, job_id: 1, found_at: '2026-09-30T23:30:00.000Z', datum: '2026-09-30', netto_kg: 10000, invoiced_ore: null },
        { ...base, lass_id: 31, job_id: 1, found_at: '2026-09-20T10:00:00.000Z', datum: '2026-09-18', netto_kg: 10000, invoiced_ore: null },
      ],
      corrections: [],
      valueOf,
      today: '2026-10-09',
    });
    expect(r.items[0].found_date).toBe('2026-10-01');
    expect(r.totals.month_value_ore).toBe(132000);
    expect(r.totals.value_ore).toBe(264000);
    expect(r.totals.first_found_at).toBe('2026-09-20T10:00:00.000Z');
  });

  it('is empty when nothing was found', () => {
    expect(foundValue({ created: [], corrections: [], valueOf, today: '2026-10-09' })).toEqual({
      totals: {
        value_ore: 0, month_value_ore: 0, lass: 0, lass_value_ore: 0, unpriced: 0, weight_up: 0, weight_up_value_ore: 0,
        weight_down: 0, first_found_at: null,
      },
      items: [],
    });
  });
});
