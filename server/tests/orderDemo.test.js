import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createAiService, AiDemoNoMatchError } from '../services/ai.js';
import { OrderExtractionSchema, postProcessOrder } from '../lib/orderExtraction.js';
import { demoOrderSamples, findDemoOrder } from '../lib/orderDemo.js';
import { TEST_ENV, testConfig, testDb, addCompanyWithUser, silentLogger } from './helpers.js';
import { fakeClient, ORDER_EMAIL_OUTPUT } from './fixtures.js';

const now = () => new Date('2026-10-03T08:00:00Z'); // Saturday
const TODAY = '2026-10-03';

function demoAi({ apiKey, client } = {}) {
  const config = testConfig({ DEMO_MODE: '1', ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}) });
  const db = testDb();
  const { companyId } = addCompanyWithUser(db);
  const ai = createAiService({ db, config, client, now, logger: silentLogger, demoDelayMs: 0 });
  return { db, ai, companyId };
}

describe('DEMO_MODE config', () => {
  it('is off by default and refused in production', () => {
    expect(loadConfig(TEST_ENV).anthropic.demoMode).toBe(false);
    expect(loadConfig({ ...TEST_ENV, DEMO_MODE: '1' }).anthropic.demoMode).toBe(true);
    expect(() => loadConfig({ ...TEST_ENV, NODE_ENV: 'production', DEMO_MODE: '1' })).toThrow(/DEMO_MODE/);
  });
});

describe('demo order samples', () => {
  it('each canned output is a valid extraction that post-processes cleanly', () => {
    const samples = demoOrderSamples(TODAY);
    expect(new Set(samples.map((s) => s.id)).size).toBe(samples.length);
    for (const s of samples) {
      const hit = findDemoOrder(s.text, TODAY);
      expect(hit.id).toBe(s.id);
      expect(OrderExtractionSchema.safeParse(hit.output).success).toBe(true);
      const { fields, warnings } = postProcessOrder(hit.output, { today: TODAY });
      expect(warnings).toEqual([]);
      expect(fields.uppdragstyp.value).not.toBeNull();
      expect(fields.datum.value > TODAY).toBe(true);
      // Model-reported confidence survives validation: nothing was silently downgraded.
      for (const [k, v] of Object.entries(hit.output)) {
        if (v.value != null) expect(fields[k].confidence, `${s.id}.${k}`).toBe(v.confidence);
      }
    }
  });

  it('matches only the sample texts, ignoring whitespace and case', () => {
    const [first] = demoOrderSamples(TODAY);
    expect(findDemoOrder(`  ${first.text.toUpperCase().replace(/\n/g, '\r\n')}  `, TODAY)?.id).toBe(first.id);
    expect(findDemoOrder(first.text.replace('12 lass', '15 lass'), TODAY)).toBeNull();
    expect(findDemoOrder('Hej, kan ni köra grus på måndag?', TODAY)).toBeNull();
  });
});

describe('ai service in DEMO_MODE', () => {
  it('returns and logs the canned extraction for a sample text', async () => {
    const { ai, db, companyId } = demoAi();
    expect(ai.usage(companyId)).toMatchObject({ configured: true, demo: true, model: 'demo' });
    const sample = ai.demoSamples().find((s) => s.id === 'rorstrand');

    const r = await ai.extractOrder({ companyId, companyName: 'Teståkeriet AB', text: sample.text });
    expect(r.model).toBe('demo');
    expect(r.fields.kund).toEqual({ value: 'Norrbacka Mark & Anläggning AB', confidence: 'hog' });
    expect(r.fields.telefon.value).toBe('+46701740610');
    expect(r.fields.datum).toEqual({ value: '2026-10-06', confidence: 'medel' }); // "på tisdag"

    const row = db.prepare('SELECT * FROM ai_extractions WHERE id = ?').get(r.extractionId);
    expect(row).toMatchObject({ model: 'demo', prompt_version: 'order-demo-v1', cost_micro_usd: 0, error: null });
  });

  it('rejects any other text instead of guessing', async () => {
    const { ai, companyId } = demoAi();
    await expect(ai.extractOrder({ companyId, companyName: 'X', text: 'Hej, kan ni köra grus på måndag?' }))
      .rejects.toBeInstanceOf(AiDemoNoMatchError);
  });

  it('is ignored when a real API key is configured', async () => {
    const client = fakeClient({ parsed_output: ORDER_EMAIL_OUTPUT });
    const { ai, companyId } = demoAi({ apiKey: 'sk-test', client });
    expect(ai.demo).toBe(false);
    expect(ai.demoSamples()).toEqual([]);
    await ai.extractOrder({ companyId, companyName: 'X', text: 'Hej, kan ni köra grus på måndag?' });
    expect(client.calls).toHaveLength(1);
  });
});

describe('order intake API in DEMO_MODE', () => {
  async function setup({ demoMode = '1' } = {}) {
    const config = testConfig({ DEMO_MODE: demoMode });
    const db = testDb();
    const user = addCompanyWithUser(db);
    const ai = createAiService({ db, config, now, logger: silentLogger, demoDelayMs: 0 });
    const app = createApp({ config, db, services: { ai }, logger: silentLogger });
    const token = (await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).body.token;
    const as = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
    return { as };
  }

  it('lists samples and turns one into a draft with matched customer and project', async () => {
    const { as } = await setup();
    const customer = (await as('post', '/api/customers').send({ name: 'Norrbacka Mark & Anläggning AB', org_nr: '559101-2348' })).body;
    const project = (await as('post', '/api/projects').send({
      customer_id: customer.id, name: 'Kv. Rörstrand – schakt', address: 'Rörstrandsgatan 40', miljozon: 1,
    })).body;

    const samples = (await as('get', '/api/intake/demo-samples').expect(200)).body;
    expect(samples.map((s) => s.kind)).toEqual(expect.arrayContaining(['mejl', 'sms', 'pdf']));

    const text = samples.find((s) => s.id === 'rorstrand').text;
    const intake = (await as('post', '/api/intake/extract').send({ text }).expect(201)).body;
    expect(intake).toMatchObject({ source: 'ai', model: 'demo', raw_text: text });
    expect(intake.preselect).toEqual({ customer_id: customer.id, project_id: project.id });

    const res = await as('post', '/api/intake/extract').send({ text: 'Hej, kan ni köra grus på måndag?' }).expect(422);
    expect(res.body.error.code).toBe('ai_demo_no_match');
  });

  it('has no samples when DEMO_MODE is off', async () => {
    const { as } = await setup({ demoMode: '0' });
    expect((await as('get', '/api/intake/demo-samples').expect(200)).body).toEqual([]);
  });
});
