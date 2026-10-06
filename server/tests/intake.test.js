import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createAiService } from '../services/ai.js';
import { testConfig, testDb, addCompanyWithUser, silentLogger } from './helpers.js';
import { fakeClient, ORDER_EMAIL, ORDER_EMAIL_OUTPUT, orderOutput, mf } from './fixtures.js';

async function setup({ output = ORDER_EMAIL_OUTPUT, apiKey = 'sk-test' } = {}) {
  const config = testConfig(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {});
  const db = testDb();
  const user = addCompanyWithUser(db);
  const client = apiKey ? fakeClient({ parsed_output: output }) : undefined;
  const ai = createAiService({ db, config, client, now: () => new Date('2026-10-03T08:00:00Z'), logger: silentLogger });
  const app = createApp({ config, db, services: { ai }, logger: silentLogger });
  const token = (await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).body.token;
  const as = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);

  // Existing master data, as in the demo seed.
  const customer = (await as('post', '/api/customers').send({
    name: 'Norrbacka Mark & Anläggning AB', org_nr: '559101-2348', email: 'faktura@norrbackamark.se',
  })).body;
  const project = (await as('post', '/api/projects').send({
    customer_id: customer.id, name: 'Kv. Rörstrand – schakt', customer_ref: 'NMA-2611', address: 'Rörstrandsgatan 40', miljozon: 1,
  })).body;
  return { db, app, as, client, customer, project };
}

/** Job fields as the UI would submit them after review. */
function reviewedFields(intake, overrides = {}) {
  const v = (k) => intake.fields[k].value;
  return {
    uppdragstyp: v('uppdragstyp'), datum: v('datum'), datum_till: v('datum_till'), tid: v('tid'),
    material: v('material'), uppskattad_mangd: v('uppskattad_mangd'), mangd_enhet: v('mangd_enhet'),
    antal_lass: v('antal_lass'), fran: v('fran'), till: v('till'), instruktioner: v('instruktioner'),
    kontaktperson: v('kontaktperson'), telefon: v('telefon'),
    ...overrides,
  };
}

describe('order intake', () => {
  it('extracts, suggests the existing customer and project, and pre-selects them', async () => {
    const { as, customer, project } = await setup();
    const res = await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'utkast', source: 'ai', model: 'claude-opus-5-5' });
    expect(res.body.fields.antal_lass).toEqual({ value: 12, confidence: 'lag' });
    expect(res.body.preselect).toEqual({ customer_id: customer.id, project_id: project.id });

    const drafts = (await as('get', '/api/intake')).body;
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ kund: 'Norrbacka Mark & Anläggning AB', datum: '2026-10-06' });
  });

  it('blocks confirmation until low-confidence values are changed or accepted (human in the loop)', async () => {
    const { as, customer, project } = await setup();
    const intake = (await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL })).body;
    const body = { fields: reviewedFields(intake), customer: { id: customer.id }, project: { id: project.id } };

    const blocked = await as('post', `/api/intake/${intake.id}/confirm`).send(body);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe('unreviewed_fields');
    expect(Object.keys(blocked.body.error.fields)).toEqual(['fields.antal_lass']);

    // Accepting it explicitly works …
    const ok = await as('post', `/api/intake/${intake.id}/confirm`).send({ ...body, acknowledged: ['antal_lass'] });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ customer_id: customer.id, project_id: project.id });

    const job = (await as('get', `/api/jobs/${ok.body.job_id}`)).body;
    expect(job).toMatchObject({
      status: 'bekraftad', uppdragstyp: 'schakt', datum_fran: '2026-10-06', tid: '07:00', antal_lass: 12,
      telefon: '+46701740610', project_name: 'Kv. Rörstrand – schakt', order_text: ORDER_EMAIL,
    });
    expect(job.overrides).toEqual({ changed: {}, acknowledged: ['antal_lass'] });

    // … and the intake can't be confirmed twice.
    expect((await as('post', `/api/intake/${intake.id}/confirm`).send({ ...body, acknowledged: ['antal_lass'] })).status).toBe(409);
  });

  it('accepts a changed low-confidence value and records the override', async () => {
    const { as, customer, project } = await setup();
    const intake = (await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL })).body;
    const res = await as('post', `/api/intake/${intake.id}/confirm`).send({
      fields: reviewedFields(intake, { antal_lass: 14 }), customer: { id: customer.id }, project: { id: project.id },
    });
    expect(res.status).toBe(201);
    const job = (await as('get', `/api/jobs/${res.body.job_id}`)).body;
    expect(job.antal_lass).toBe(14);
    expect(job.overrides.changed).toEqual({ antal_lass: { ai: 12, final: 14 } });
  });

  it('requires uppdragstyp and datum', async () => {
    const { as, customer, project } = await setup({ output: orderOutput({ kund: mf('Norrbacka') }) });
    const intake = (await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL })).body;
    const res = await as('post', `/api/intake/${intake.id}/confirm`).send({
      fields: reviewedFields(intake), customer: { id: customer.id }, project: { id: project.id },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toMatchObject({ 'fields.uppdragstyp': 'Välj uppdragstyp.', 'fields.datum': expect.any(String) });
  });

  it('never creates a duplicate customer', async () => {
    const { as, db, customer } = await setup();
    const intake = (await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL })).body;
    const base = { fields: reviewedFields(intake), acknowledged: ['antal_lass'], project: { new: { name: 'Nytt projekt' } } };

    const sameOrg = await as('post', `/api/intake/${intake.id}/confirm`).send({
      ...base, customer: { new: { name: 'Norrbacka Mark AB', org_nr: '5591012348' } },
    });
    expect(sameOrg.status).toBe(409);
    expect(sameOrg.body.error).toMatchObject({ code: 'duplicate_org_nr', existing_id: customer.id });

    const similar = await as('post', `/api/intake/${intake.id}/confirm`).send({
      ...base, customer: { new: { name: 'Norrbacka Mark och Anläggning' } },
    });
    expect(similar.status).toBe(409);
    expect(similar.body.error.code).toBe('similar_customer');
    expect(similar.body.error.candidates[0].id).toBe(customer.id);
    expect(db.prepare('SELECT COUNT(*) FROM customers').pluck().get()).toBe(1);

    // A genuinely new customer, explicitly confirmed despite the similarity, is allowed.
    const forced = await as('post', `/api/intake/${intake.id}/confirm`).send({
      ...base, customer: { new: { name: 'Norrbacka Mark och Anläggning' }, allow_similar: true },
    });
    expect(forced.status).toBe(201);
    expect(db.prepare('SELECT COUNT(*) FROM customers').pluck().get()).toBe(2);
  });

  it('rejects a project that belongs to another customer and rolls back', async () => {
    const { as, db, project } = await setup();
    const intake = (await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL })).body;
    const res = await as('post', `/api/intake/${intake.id}/confirm`).send({
      fields: reviewedFields(intake), acknowledged: ['antal_lass'],
      customer: { new: { name: 'Helt Ny Kund AB' } }, project: { id: project.id },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('project_customer_mismatch');
    // The new customer from the failed transaction must not exist.
    expect(db.prepare(`SELECT COUNT(*) FROM customers WHERE name = 'Helt Ny Kund AB'`).pluck().get()).toBe(0);
  });

  it('creates customer and project from the order when both are new', async () => {
    const { as } = await setup();
    const intake = (await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL })).body;
    const res = await as('post', `/api/intake/${intake.id}/confirm`).send({
      fields: reviewedFields(intake), acknowledged: ['antal_lass'],
      customer: { new: { name: 'Vallentuna Grus AB', org_nr: '559212-6782' } },
      project: { new: { name: 'Kv. Lärkan', address: 'Lärkvägen 3', postnr: '186 30', ort: 'Vallentuna', miljozon: 0 } },
    });
    expect(res.status).toBe(201);
    const job = (await as('get', `/api/jobs/${res.body.job_id}`)).body;
    expect(job).toMatchObject({ customer_name: 'Vallentuna Grus AB', project_name: 'Kv. Lärkan', project_postnr: '18630' });
  });

  it('supports manual entry without AI and discarding drafts', async () => {
    const { as, customer, project } = await setup({ apiKey: null });
    const ai = await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL });
    expect(ai.status).toBe(503);
    expect(ai.body.error.code).toBe('ai_not_configured');

    const manual = (await as('post', '/api/intake/manual').send({ text: 'Telefonbeställning från Petra' })).body;
    expect(manual).toMatchObject({ source: 'manuell', model: null });
    expect(manual.fields.datum).toEqual({ value: null, confidence: 'saknas' });
    const ok = await as('post', `/api/intake/${manual.id}/confirm`).send({
      fields: { uppdragstyp: 'kran', datum: '2026-10-07' }, customer: { id: customer.id }, project: { id: project.id },
    });
    expect(ok.status).toBe(201);

    const draft = (await as('post', '/api/intake/manual').send({})).body;
    expect((await as('post', `/api/intake/${draft.id}/discard`)).status).toBe(200);
    expect((await as('post', `/api/intake/${draft.id}/discard`)).status).toBe(409);
  });

  it('returns a Swedish error when the AI call fails, and stores nothing', async () => {
    const config = testConfig({ ANTHROPIC_API_KEY: 'sk-test' });
    const db = testDb();
    const user = addCompanyWithUser(db);
    const ai = createAiService({ db, config, client: fakeClient({ stop_reason: 'refusal', parsed_output: null }), logger: silentLogger });
    const app = createApp({ config, db, services: { ai }, logger: silentLogger });
    const token = (await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).body.token;
    const res = await request(app).post('/api/intake/extract').set('Authorization', `Bearer ${token}`).send({ text: ORDER_EMAIL });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ code: 'ai_refusal', message: expect.stringMatching(/manuellt/) });
    expect(db.prepare('SELECT COUNT(*) FROM order_intakes').pluck().get()).toBe(0);
  });

  it('validates the pasted text', async () => {
    const { as } = await setup();
    expect((await as('post', '/api/intake/extract').send({ text: 'hej' })).status).toBe(400);
    expect((await as('post', '/api/intake/extract').send({ text: 'x'.repeat(20_001) })).status).toBe(400);
  });

  it('reports AI usage for the month', async () => {
    const { as } = await setup();
    await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL });
    const i = (await as('get', '/api/settings/integrations')).body;
    expect(i.ai).toMatchObject({ configured: true, model: 'claude-opus-5-5', calls: 1, month_cost_usd: 0.02, budget_usd: 30 });
  });
});

describe('jobs', () => {
  it('lists and cancels jobs without lass', async () => {
    const { as, customer, project } = await setup();
    const intake = (await as('post', '/api/intake/extract').send({ text: ORDER_EMAIL })).body;
    const { job_id } = (await as('post', `/api/intake/${intake.id}/confirm`).send({
      fields: reviewedFields(intake), acknowledged: ['antal_lass'], customer: { id: customer.id }, project: { id: project.id },
    })).body;
    const list = (await as('get', '/api/jobs?from=2026-10-01&to=2026-10-31')).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: job_id, customer_name: customer.name, lass_count: 0 });
    expect((await as('post', `/api/jobs/${job_id}/cancel`)).status).toBe(200);
    expect((await as('get', `/api/jobs/${job_id}`)).body.status).toBe('avbruten');
  });
});
