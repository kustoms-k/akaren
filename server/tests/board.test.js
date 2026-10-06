import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { seedDemo, DEMO_EMAIL } from '../seed/demo.js';
import { stockholmDate } from '../lib/dates.js';
import { bookingDays, buildAssignmentSms } from '../lib/dispatch.js';
import { testConfig, testDb, silentLogger } from './helpers.js';

const TODAY = stockholmDate();
const PASSWORD = 'hemligt123';

const fakeSms = () => {
  const sent = [];
  return { sent, enabled: false, sender: 'Lasskoll', async send(to, text) { sent.push({ to, text }); return { status: 'simulerat' }; } };
};

let ctx;
beforeEach(async () => {
  const config = testConfig({ DATA_DIR: mkdtempSync(join(tmpdir(), 'akaren-test-')) });
  const db = testDb();
  seedDemo(db, { today: TODAY, password: PASSWORD });
  const sms = fakeSms();
  const app = createApp({ config, db, services: { sms }, logger: silentLogger });
  const token = (await request(app).post('/api/auth/login').send({ email: DEMO_EMAIL, password: PASSWORD })).body.token;
  const as = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${token}`);
  const lastDay = db.prepare('SELECT MAX(datum) FROM job_assignments').pluck().get();
  const jobId = (name) => db.prepare(`SELECT j.id FROM jobs j JOIN projects p ON p.id = j.project_id WHERE p.name = ? ORDER BY j.id LIMIT 1`).pluck().get(name);
  ctx = { db, as, sms, lastDay, jobId };
});

describe('day board', () => {
  it('shows each truck\'s job, driver and lass for the day, free drivers and totals', async () => {
    const res = await ctx.as('get', `/api/board?datum=${ctx.lastDay}`);
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.datum).toBe(ctx.lastDay);
    expect(b.vehicles).toHaveLength(5);
    const tka412 = b.vehicles.find((v) => v.regnr === 'TKA412');
    expect(tka412.assignments).toHaveLength(1);
    expect(tka412.assignments[0]).toMatchObject({ project_name: 'Kv. Rörstrand – schakt', driver_name: 'Mikael Lund' });
    expect(tka412.assignments[0].lass_count).toBeGreaterThan(0);
    expect(tka412.assignments[0].netto_kg).toBeGreaterThan(0);
    // Busy trucks come first.
    const firstFree = b.vehicles.findIndex((v) => v.assignments.length === 0);
    if (firstFree >= 0) expect(b.vehicles.slice(firstFree).every((v) => v.assignments.length === 0)).toBe(true);
    expect(b.totals.lass).toBe(b.vehicles.flatMap((v) => v.assignments).reduce((s, a) => s + a.lass_count, 0));
    const lassThatDay = ctx.db.prepare('SELECT COUNT(*) FROM lass_current WHERE datum = ? AND assignment_id IS NOT NULL').pluck().get(ctx.lastDay);
    expect(b.totals.lass).toBe(lassThatDay);
    expect(b.free_drivers.every((d) => !b.vehicles.some((v) => v.assignments.some((a) => a.driver_id === d.id)))).toBe(true);
  });

  it('lists active jobs that run on the day without a truck', async () => {
    const day = '2099-03-02';
    ctx.db.prepare(`UPDATE jobs SET datum_till = ? WHERE id = ?`).run('2099-03-06', ctx.jobId('Täby Park etapp 3 – VA-schakt'));
    const b = (await ctx.as('get', `/api/board?datum=${day}`)).body;
    expect(b.uncovered.map((j) => j.project_name)).toEqual(['Täby Park etapp 3 – VA-schakt']);
    expect(b.vehicles.every((v) => v.assignments.length === 0)).toBe(true);
    expect(b.free_drivers).toHaveLength(4);
  });

  it('rejects a bad date', async () => {
    expect((await ctx.as('get', '/api/board?datum=igår')).status).toBe(400);
  });
});

describe('booking several days at once', () => {
  it('books every working day in the range, skipping weekends and holidays, with one SMS', async () => {
    expect(bookingDays('2030-12-20', '2030-12-27')).toEqual(['2030-12-20', '2030-12-23', '2030-12-27']);
    const job = ctx.jobId('Täby Park etapp 3 – VA-schakt');
    const vehicle = ctx.db.prepare(`SELECT id FROM vehicles WHERE regnr = 'TKA418'`).pluck().get();
    const driver = ctx.db.prepare(`SELECT id FROM drivers WHERE name = 'Sara Engström'`).pluck().get();
    const res = await ctx.as('post', `/api/jobs/${job}/assignments`)
      .send({ vehicle_id: vehicle, driver_id: driver, datum: '2030-12-20', datum_till: '2030-12-27', send_sms: true });
    expect(res.status).toBe(201);
    expect(res.body.assignments.map((a) => a.datum)).toEqual(['2030-12-20', '2030-12-23', '2030-12-27']);
    expect(res.body.assignment.datum).toBe('2030-12-20');
    expect(res.body.skipped).toEqual([]);
    expect(ctx.sms.sent).toHaveLength(1);
    expect(ctx.sms.sent[0].text).toContain('fre 20 dec-fre 27 dec');

    // Booking the same range again skips what exists; a range that is all booked is refused.
    const again = await ctx.as('post', `/api/jobs/${job}/assignments`)
      .send({ vehicle_id: vehicle, driver_id: driver, datum: '2030-12-20', datum_till: '2030-12-30' });
    expect(again.status).toBe(201);
    expect(again.body.skipped).toEqual(['2030-12-20', '2030-12-23', '2030-12-27']);
    expect(again.body.assignments.map((a) => a.datum)).toEqual(['2030-12-30']);
    const full = await ctx.as('post', `/api/jobs/${job}/assignments`)
      .send({ vehicle_id: vehicle, driver_id: driver, datum: '2030-12-20', datum_till: '2030-12-30' });
    expect(full.status).toBe(409);
  });

  it('validates the range', async () => {
    const job = ctx.jobId('Täby Park etapp 3 – VA-schakt');
    const body = { vehicle_id: 1, driver_id: 1, datum: '2030-12-20' };
    expect((await ctx.as('post', `/api/jobs/${job}/assignments`).send({ ...body, datum_till: '2030-12-19' })).status).toBe(400);
    expect((await ctx.as('post', `/api/jobs/${job}/assignments`).send({ ...body, datum_till: '2031-02-20' })).status).toBe(400);
    const holidays = await ctx.as('post', `/api/jobs/${job}/assignments`).send({ ...body, datum: '2030-12-24', datum_till: '2030-12-26' });
    expect(holidays.status).toBe(400);
    expect(holidays.body.error.fields.datum_till).toMatch(/arbetsdagar/);
  });

  it('keeps the range SMS within two segments', () => {
    const text = buildAssignmentSms({
      driverName: 'Mikael Lund', datum: '2030-12-20', datumTill: '2030-12-27', tid: '07:00', typeLabel: 'Schakt',
      projectName: 'Täby Park etapp 3 – VA-schakt', address: 'Stora Marknadsvägen 15 Täby', regnr: 'TKA418',
      link: 'http://192.168.1.50:5173/f/abcdefghijklmnopqrstuv', companyName: 'Teståkeriet AB',
    });
    expect(text.length).toBeLessThanOrEqual(306);
    expect(text).toContain('fre 20 dec-fre 27 dec kl 07:00');
  });
});

describe('jobs list', () => {
  it('says whether a job runs today, its truck today and its progress', async () => {
    const jobs = (await ctx.as('get', '/api/jobs')).body;
    const rorstrand = jobs.find((j) => j.project_name === 'Kv. Rörstrand – schakt');
    expect(rorstrand.netto_kg).toBeGreaterThan(0);
    expect(typeof rorstrand.runs_today).toBe('boolean');
    expect(rorstrand.to_review).toBe(ctx.db.prepare(`SELECT COUNT(*) FROM lass_current WHERE job_id = ? AND review_status = 'behover_granskas'`).pluck().get(rorstrand.id));
    if (ctx.lastDay === TODAY) expect(rorstrand.today_regnrs).toContain('TKA412');
  });
});
