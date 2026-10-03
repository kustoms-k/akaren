import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../app.js';
import { createAiService } from '../services/ai.js';
import { testConfig, testDb, addCompanyWithUser, silentLogger } from './helpers.js';
import { fakeClient, mf } from './fixtures.js';
import { stockholmDate } from '../lib/dates.js';

const TODAY = stockholmDate();

const slipOutput = (o = {}) => ({
  vagsedel_nr: mf('EKB418233'), datum: mf(TODAY), tid: mf('09:42'), regnr: mf('TKA 412'), material: mf('Schaktmassor'),
  avfallskod: mf('170504'), farligt_avfall: mf(false), netto_kg: mf(18420), brutto_kg: mf(32100), tara_kg: mf(13680),
  lastplats: mf(null, 'lag'), mottagare: mf('Ekbacka massmottagning'), mottagare_orgnr: mf(null, 'lag'),
  mottagare_adress: mf(null, 'lag'), kund: mf(null, 'lag'), projekt: mf(null, 'lag'), ...o,
});

async function jpegWithGps() {
  return sharp({ create: { width: 3000, height: 4000, channels: 3, background: '#f4f1ea' } })
    .jpeg()
    // Position of a worksite in Vasastan, as a phone camera would store it.
    .withExif({
      IFD0: { Make: 'Apple', Model: 'iPhone 15' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '59/1 20/1 30/1', GPSLongitudeRef: 'E', GPSLongitude: '18/1 2/1 15/1' },
    })
    .toBuffer();
}

let ctx;
beforeEach(async () => {
  const config = testConfig({ ANTHROPIC_API_KEY: 'sk-test', DATA_DIR: mkdtempSync(join(tmpdir(), 'akaren-test-')) });
  const db = testDb();
  const user = addCompanyWithUser(db);
  let aiResponse = { parsed_output: slipOutput() };
  const client = fakeClient(() => aiResponse);
  const ai = createAiService({ db, config, client, logger: silentLogger });
  const sent = [];
  const sms = { enabled: true, send: async (to, message) => { sent.push({ to, message }); return { status: 'skickat' }; } };
  const app = createApp({ config, db, services: { ai, sms }, logger: silentLogger });
  const officeToken = (await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).body.token;
  const office = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${officeToken}`);

  const customer = (await office('post', '/api/customers').send({ name: 'Norrbacka Mark AB' })).body;
  const project = (await office('post', '/api/projects').send({ customer_id: customer.id, name: 'Kv. Rörstrand', miljozon: 1, address: 'Rörstrandsgatan 40', ort: 'Stockholm' })).body;
  const euro6 = (await office('post', '/api/vehicles').send({ regnr: 'TKA412', typ: 'tippbil', miljozonsklass: 1 })).body;
  const euro5 = (await office('post', '/api/vehicles').send({ regnr: 'MXR27C', typ: 'tippbil', miljozonsklass: 0 })).body;
  const mikael = (await office('post', '/api/drivers').send({ name: 'Mikael Lund', phone: '070-174 06 05' })).body;
  const sara = (await office('post', '/api/drivers').send({ name: 'Sara Engström', phone: '070-174 06 06' })).body;
  const jobId = Number(db.prepare(`INSERT INTO jobs (company_id, customer_id, project_id, uppdragstyp, material, datum_fran, tid,
      fran_text, till_text, created_by_user_id) VALUES (?, ?, ?, 'schakt', 'Schaktmassor', ?, '07:00', 'Rörstrandsgatan 40', 'Ekbacka', ?)`)
    .run(user.companyId, customer.id, project.id, TODAY, user.userId).lastInsertRowid);

  /** Assign + SMS, then open the link like the phone would. Returns a driver request helper. */
  async function driverSession(driver, vehicle = euro6) {
    const res = await office('post', `/api/jobs/${jobId}/assignments`).send({ vehicle_id: vehicle.id, driver_id: driver.id, datum: TODAY, send_sms: true, acknowledge_miljozon: true });
    const token = res.body.sms.link.split('/f/')[1];
    const session = await request(app).post('/api/driver/session').send({ token });
    const as = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${session.body.token}`);
    return { as, assignment: res.body.assignment, token, sessionToken: session.body.token, smsRes: res.body.sms };
  }

  ctx = {
    app, db, config, office, sent, client, jobId, customer, project, euro6, euro5, mikael, sara, driverSession,
    setAi: (r) => { aiResponse = r; },
  };
});

describe('dispatch', () => {
  it('warns when the vehicle does not meet the project miljözon, and records an acknowledged override', async () => {
    const { office, jobId, euro5, sara } = ctx;
    const res = await office('post', `/api/jobs/${jobId}/assignments`).send({ vehicle_id: euro5.id, driver_id: sara.id, datum: TODAY });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'miljozon_warning', zone: 1, vehicle_class: 0 });
    expect(res.body.error.message).toMatch(/MXR27C uppfyller inte miljözon klass 1/);

    const ok = await office('post', `/api/jobs/${jobId}/assignments`).send({ vehicle_id: euro5.id, driver_id: sara.id, datum: TODAY, acknowledge_miljozon: true });
    expect(ok.status).toBe(201);
    expect(ok.body.assignment).toMatchObject({ regnr: 'MXR27C', miljozon_warning: 1, sms_status: 'ej_skickat' });
    expect(ctx.sent).toHaveLength(0);
  });

  it('texts the driver a short magic link and stores only its hash', async () => {
    const { db, sent, mikael } = ctx;
    const { smsRes, token } = await ctx.driverSession(mikael);
    expect(smsRes.status).toBe('skickat');
    expect(sent[0].to).toBe('+46701740605');
    expect(sent[0].message).toMatch(/^Hej Mikael! Uppdrag .* med TKA412: Schakt, Kv\. Rörstrand, Rörstrandsgatan 40 Stockholm\. Info och lassrapport: http:\/\/192\.168\.1\.50:5173\/f\/[A-Za-z0-9_-]{22} \/Test AB$/);
    expect(token).toHaveLength(22);
    const stored = db.prepare('SELECT token_hash FROM driver_links').pluck().all();
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toContain(token);
    const auditText = db.prepare('SELECT after_json FROM audit_log').pluck().all().join(' ');
    expect(auditText).not.toContain(token);
  });

  it('blocks a duplicate assignment for the same truck, driver and day', async () => {
    const { office, jobId, euro6, mikael } = ctx;
    const body = { vehicle_id: euro6.id, driver_id: mikael.id, datum: TODAY };
    expect((await office('post', `/api/jobs/${jobId}/assignments`).send(body)).status).toBe(201);
    expect((await office('post', `/api/jobs/${jobId}/assignments`).send(body)).status).toBe(409);
  });
});

describe('driver access', () => {
  it('scopes a driver to their own assignments and photos', async () => {
    const { mikael, sara } = ctx;
    const m = await ctx.driverSession(mikael);
    const s = await ctx.driverSession(sara);

    const mine = await m.as('get', '/api/driver/assignments');
    expect(mine.body.map((a) => a.id)).toEqual([m.assignment.id]);
    expect(mine.body[0]).toMatchObject({ regnr: 'TKA412', project_name: 'Kv. Rörstrand', customer_name: 'Norrbacka Mark AB' });
    expect((await s.as('get', `/api/driver/assignments/${m.assignment.id}`)).status).toBe(404);

    const up = await m.as('post', '/api/driver/photos').field('assignment_id', String(m.assignment.id)).attach('photo', await jpegWithGps(), 'slip.jpg');
    expect(up.status).toBe(201);
    expect((await s.as('get', `/api/driver/photos/${up.body.photo_id}`)).status).toBe(404);
    expect((await m.as('get', `/api/driver/photos/${up.body.photo_id}`)).status).toBe(200);

    // Sara cannot report on Mikael's assignment.
    const res = await s.as('post', '/api/driver/lass').send({ assignment_id: m.assignment.id, client_uuid: randomUUID(), fields: { datum: TODAY } });
    expect(res.status).toBe(404);
  });

  it('rejects bad, expired and revoked links, and drivers that were removed', async () => {
    const { app, db, mikael } = ctx;
    expect((await request(app).post('/api/driver/session').send({ token: 'x'.repeat(22) })).status).toBe(401);

    const m = await ctx.driverSession(mikael);
    expect((await m.as('get', '/api/driver/me')).status).toBe(200);

    db.prepare(`UPDATE driver_links SET revoked_at = '2026-01-01T00:00:00Z'`).run();
    expect((await m.as('get', '/api/driver/me')).status).toBe(401);
    expect((await request(app).post('/api/driver/session').send({ token: m.token })).status).toBe(401);

    db.prepare('UPDATE driver_links SET revoked_at = NULL').run();
    db.prepare(`UPDATE driver_links SET expires_at = '2020-01-01T00:00:00Z'`).run();
    expect((await m.as('get', '/api/driver/me')).status).toBe(401);

    db.prepare(`UPDATE driver_links SET expires_at = '2099-01-01T00:00:00Z'`).run();
    db.prepare('UPDATE drivers SET anonymized_at = ? WHERE id = ?').run('2026-10-01', mikael.id);
    const res = await m.as('get', '/api/driver/me');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/Länken har gått ut/);
  });

  it('keeps driver and office tokens apart', async () => {
    const m = await ctx.driverSession(ctx.mikael);
    expect((await m.as('get', '/api/customers')).status).toBe(401);
    expect((await ctx.office('get', '/api/driver/assignments')).status).toBe(401);
  });
});

describe('vågsedel photo and lass reporting', () => {
  it('re-encodes photos without EXIF, reads the ticket and creates an ok lass', async () => {
    const { db, config, client, office, jobId, mikael } = ctx;
    const m = await ctx.driverSession(mikael);
    const up = await m.as('post', '/api/driver/photos').field('assignment_id', String(m.assignment.id)).attach('photo', await jpegWithGps(), 'slip.jpg');
    expect(up.status).toBe(201);
    expect(up.body.extraction.fields.netto_kg).toEqual({ value: 18420, confidence: 'hog' });

    // Stored file: resized, metadata gone, random id as name.
    const file = readFileSync(join(config.photosDir, up.body.photo_id.slice(0, 2), `${up.body.photo_id}.jpg`));
    const meta = await sharp(file).metadata();
    expect(Math.max(meta.width, meta.height)).toBe(2000);
    expect((await sharp(await jpegWithGps()).metadata()).exif).toBeDefined(); // the upload had GPS …
    expect(meta.exif).toBeUndefined(); // … the stored photo has none
    // The model got the image.
    expect(client.calls[0].messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });

    const f = up.body.extraction.fields;
    const body = {
      assignment_id: m.assignment.id, client_uuid: randomUUID(), photo_id: up.body.photo_id, ai_extraction_id: up.body.extraction.id,
      fields: { vagsedel_nr: f.vagsedel_nr.value, datum: f.datum.value, tid: f.tid.value, material: f.material.value, netto_kg: f.netto_kg.value, avfallskod: f.avfallskod.value, till_namn: f.mottagare.value },
    };
    const created = await m.as('post', '/api/driver/lass').send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ version: 1, review_status: 'ok', review_reasons: [], vehicle_regnr: 'TKA412', netto_kg: 18420 });
    expect(created.body.field_confidence).toMatchObject({ netto_kg: 'hog', vagsedel_nr: 'hog' });

    // Retrying the same submit (e.g. after a timeout) does not create a second lass.
    const retry = await m.as('post', '/api/driver/lass').send(body);
    expect(retry.status).toBe(200);
    expect(retry.body.lass_id).toBe(created.body.lass_id);
    expect(db.prepare('SELECT COUNT(*) FROM lass').pluck().get()).toBe(1);

    // The job is now in progress and the office sees the lass and the photo.
    expect((await office('get', `/api/jobs/${jobId}`)).body.status).toBe('pagar');
    const officeLass = (await office('get', `/api/jobs/${jobId}/lass`)).body;
    expect(officeLass[0]).toMatchObject({ vagsedel_nr: 'EKB418233', driver_name: 'Mikael Lund' });
    expect((await office('get', `/api/photos/${up.body.photo_id}`)).headers['content-type']).toBe('image/jpeg');
  });

  it('a retried upload of the same photo reuses the reading instead of paying for another AI call', async () => {
    const m = await ctx.driverSession(ctx.mikael);
    const img = await jpegWithGps();
    const a = await m.as('post', '/api/driver/photos').field('assignment_id', String(m.assignment.id)).attach('photo', img, 'a.jpg');
    const b = await m.as('post', '/api/driver/photos').field('assignment_id', String(m.assignment.id)).attach('photo', img, 'a.jpg');
    expect(b.body.photo_id).toBe(a.body.photo_id);
    expect(b.body.extraction.id).toBe(a.body.extraction.id);
    expect(ctx.client.calls).toHaveLength(1);
  });

  it('flags lass for office review: unread weight, another truck, no photo, duplicate ticket, hazardous waste', async () => {
    ctx.setAi({ parsed_output: slipOutput({ netto_kg: mf(18420, 'lag'), regnr: mf('MXR27C') }) });
    const m = await ctx.driverSession(ctx.mikael);
    const up = await m.as('post', '/api/driver/photos').field('assignment_id', String(m.assignment.id)).attach('photo', await jpegWithGps(), 's.jpg');
    expect(up.body.extraction.warnings[0]).toMatch(/MXR27C/);
    const unsure = await m.as('post', '/api/driver/lass').send({
      assignment_id: m.assignment.id, client_uuid: randomUUID(), photo_id: up.body.photo_id, ai_extraction_id: up.body.extraction.id,
      fields: { vagsedel_nr: 'EKB418233', datum: TODAY, material: 'Schaktmassor', netto_kg: 18420 },
    });
    expect(unsure.body.review_status).toBe('behover_granskas');
    expect(unsure.body.review_reasons).toEqual(['Nettovikt osäker', 'Annat regnr på vågsedeln']);

    // Manual entry without a photo, reusing the same ticket number, with hazardous waste.
    const manual = await m.as('post', '/api/driver/lass').send({
      assignment_id: m.assignment.id, client_uuid: randomUUID(),
      fields: { vagsedel_nr: 'ekb418233', datum: TODAY, material: 'Förorenade massor', netto_kg: 15000, avfallskod: '17 05 03*', farligt_avfall: true },
    });
    expect(manual.status).toBe(201);
    expect(manual.body.avfallskod).toBe('170503');
    expect(manual.body.review_reasons).toEqual(['Inget foto på vågsedeln', 'Vågsedelnumret är redan rapporterat', 'Farligt avfall']);
  });

  it('a corrected weight from the driver counts as checked by a person', async () => {
    ctx.setAi({ parsed_output: slipOutput({ netto_kg: mf(1842, 'lag') }) });
    const m = await ctx.driverSession(ctx.mikael);
    const up = await m.as('post', '/api/driver/photos').field('assignment_id', String(m.assignment.id)).attach('photo', await jpegWithGps(), 's.jpg');
    const res = await m.as('post', '/api/driver/lass').send({
      assignment_id: m.assignment.id, client_uuid: randomUUID(), photo_id: up.body.photo_id, ai_extraction_id: up.body.extraction.id,
      fields: { vagsedel_nr: 'EKB418233', datum: TODAY, material: 'Schaktmassor', netto_kg: 18420 },
    });
    expect(res.body.field_confidence.netto_kg).toBe('forare');
    expect(res.body.review_status).toBe('ok');
  });

  it('lets the driver correct a lass with a new version until the office has reviewed it', async () => {
    const { db } = ctx;
    const m = await ctx.driverSession(ctx.mikael);
    const created = (await m.as('post', '/api/driver/lass').send({
      assignment_id: m.assignment.id, client_uuid: randomUUID(), fields: { vagsedel_nr: 'A1', datum: TODAY, material: 'Schaktmassor', netto_kg: 1500 },
    })).body;
    const v2 = await m.as('post', `/api/driver/lass/${created.lass_id}/versions`).send({ fields: { netto_kg: 15000 } });
    expect(v2.status).toBe(201);
    expect(v2.body).toMatchObject({ version: 2, netto_kg: 15000, change_reason: 'Rättad av föraren' });
    expect(db.prepare('SELECT netto_kg FROM lass_versions WHERE lass_id = ? ORDER BY version').pluck().all(created.lass_id)).toEqual([1500, 15000]);

    db.prepare(`INSERT INTO lass_versions (lass_id, version, customer_id, project_id, datum, review_status, change_reason, created_by_kind)
      SELECT lass_id, 3, customer_id, project_id, datum, 'granskad', 'Granskad', 'office' FROM lass_versions WHERE lass_id = ? AND version = 2`).run(created.lass_id);
    const late = await m.as('post', `/api/driver/lass/${created.lass_id}/versions`).send({ fields: { netto_kg: 15100 } });
    expect(late.status).toBe(409);
  });

  it('still saves the photo when the AI is unavailable, so the driver can type the values', async () => {
    ctx.setAi(Object.assign(new Error('overloaded'), { status: 529 }));
    const m = await ctx.driverSession(ctx.mikael);
    const up = await m.as('post', '/api/driver/photos').field('assignment_id', String(m.assignment.id)).attach('photo', await jpegWithGps(), 's.jpg');
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ extraction: null, ai_error: 'Vågsedeln kunde inte läsas automatiskt. Fyll i värdena själv.' });
  });

  it('rejects files that are not images', async () => {
    const m = await ctx.driverSession(ctx.mikael);
    const res = await m.as('post', '/api/driver/photos').field('assignment_id', String(m.assignment.id)).attach('photo', Buffer.from('not an image'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_image');
  });

  it('records hours for hourly work', async () => {
    const m = await ctx.driverSession(ctx.mikael);
    expect((await m.as('post', `/api/driver/assignments/${m.assignment.id}/hours`).send({ timmar: 7.3 })).status).toBe(400);
    expect((await m.as('post', `/api/driver/assignments/${m.assignment.id}/hours`).send({ timmar: 7.5 })).status).toBe(201);
    expect((await m.as('get', `/api/driver/assignments/${m.assignment.id}`)).body.timmar).toBe(7.5);
  });
});
