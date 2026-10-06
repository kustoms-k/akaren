import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { testApp } from './helpers.js';

describe('auth', () => {
  it('logs in and rejects wrong passwords', async () => {
    const { app, user } = await testApp();
    const ok = await request(app).post('/api/auth/login').send({ email: user.email.toUpperCase(), password: user.password });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await request(app).post('/api/auth/login').send({ email: user.email, password: 'fel' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Fel e-post eller lösenord.');

    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@test.se', password: 'x' });
    expect(unknown.status).toBe(401);
  });

  it('protects office routes and honours deactivation', async () => {
    const { app, db, user, as } = await testApp();
    expect((await request(app).get('/api/customers')).status).toBe(401);
    expect((await as('get', '/api/customers')).status).toBe(200);

    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(user.userId);
    expect((await as('get', '/api/customers')).status).toBe(401);
  });

  it('has no passwordless login outside demo mode', async () => {
    const { app } = await testApp();
    expect((await request(app).get('/api/auth/demo')).body).toEqual({ enabled: false });
    const res = await request(app).post('/api/auth/demo-login');
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('logs in without a password in demo mode, as the first active user', async () => {
    const { app, db, user } = await testApp({ configOverrides: { DEMO_MODE: '1' } });
    expect((await request(app).get('/api/auth/demo')).body).toEqual({ enabled: true });

    const res = await request(app).post('/api/auth/demo-login');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect((await request(app).get('/api/customers').set('Authorization', `Bearer ${res.body.token}`)).status).toBe(200);

    db.prepare('UPDATE users SET active = 0').run();
    expect((await request(app).post('/api/auth/demo-login')).status).toBe(409);
  });
});

describe('customers and projects', () => {
  it('creates a customer with a normalised org nr and blocks duplicates', async () => {
    const { as } = await testApp();
    const created = await as('post', '/api/customers').send({ name: 'Norrbacka Mark AB', org_nr: '5591012348', postnr: '112 46' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ org_nr: '559101-2348', postnr: '11246', active: 1 });

    const dup = await as('post', '/api/customers').send({ name: 'Norrbacka (dubblett)', org_nr: '559101-2348' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'duplicate_org_nr', existing_id: created.body.id });
  });

  it('returns Swedish field errors', async () => {
    const { as } = await testApp();
    const res = await as('post', '/api/customers').send({ name: '', org_nr: '559101-2349' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toMatchObject({ name: 'Obligatoriskt.', org_nr: 'Ogiltigt organisationsnummer.' });
  });

  it('rejects unknown fields instead of writing them', async () => {
    const { as } = await testApp();
    const res = await as('post', '/api/customers').send({ name: 'X AB', company_id: 99 });
    expect(res.status).toBe(400);
  });

  it('scopes projects to an existing customer and audits changes', async () => {
    const { as, db } = await testApp();
    const c = (await as('post', '/api/customers').send({ name: 'Kund AB' })).body;
    expect((await as('post', '/api/projects').send({ customer_id: 999, name: 'P' })).status).toBe(400);

    const p = await as('post', '/api/projects').send({ customer_id: c.id, name: 'Kv. Rörstrand', miljozon: 1, telefon: '070-174 06 10' });
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ customer_name: 'Kund AB', miljozon: 1, telefon: '+46701740610' });

    const patched = await as('patch', `/api/projects/${p.body.id}`).send({ miljozon: 2 });
    expect(patched.body.miljozon).toBe(2);

    const detail = await as('get', `/api/customers/${c.id}`);
    expect(detail.body.projects).toHaveLength(1);

    const actions = db.prepare(`SELECT entity, action FROM audit_log ORDER BY id`).all();
    expect(actions).toEqual([
      { entity: 'customer', action: 'create' },
      { entity: 'project', action: 'create' },
      { entity: 'project', action: 'update' },
    ]);
  });
});

describe('fleet', () => {
  it('normalises regnr, enforces uniqueness and validates type', async () => {
    const { as } = await testApp();
    const v = await as('post', '/api/vehicles').send({ regnr: 'tka 412', typ: 'tippbil', miljozonsklass: 1 });
    expect(v.status).toBe(201);
    expect(v.body.regnr).toBe('TKA412');
    expect((await as('post', '/api/vehicles').send({ regnr: 'TKA412', typ: 'kranbil' })).status).toBe(409);
    expect((await as('post', '/api/vehicles').send({ regnr: 'ABC123', typ: 'bil' })).status).toBe(400);
  });

  it('stores driver phones as E.164 and keeps the values out of the audit log', async () => {
    const { as, db } = await testApp();
    const d = await as('post', '/api/drivers').send({ name: 'Mikael Lund', phone: '070-174 06 05' });
    expect(d.body.phone).toBe('+46701740605');
    await as('patch', `/api/drivers/${d.body.id}`).send({ phone: '070-174 06 06' });
    const log = db.prepare(`SELECT after_json FROM audit_log WHERE entity = 'driver'`).pluck().all().join(' ');
    expect(log).not.toContain('1740606');
  });
});

describe('settings', () => {
  it('updates company settings within allowed bounds', async () => {
    const { as } = await testApp();
    expect((await as('patch', '/api/settings').send({ retention_months: 6 })).status).toBe(400);
    const ok = await as('patch', '/api/settings').send({ retention_months: 48, default_vat_mode: 'omvand_bygg' });
    expect(ok.body).toMatchObject({ retention_months: 48, default_vat_mode: 'omvand_bygg' });
    expect(ok.body).not.toHaveProperty('fortnox_access_token_enc');
  });

  it('reports integration status without secrets', async () => {
    const { as } = await testApp({ configOverrides: { ANTHROPIC_API_KEY: 'sk-test-secret' } });
    const res = await as('get', '/api/settings/integrations');
    expect(res.body).toMatchObject({
      ai: { configured: true, model: 'claude-opus-5' },
      sms: { enabled: false, sender: 'Akaren' },
      fortnox: { configured: false, status: 'disconnected' },
      public_base_url: 'http://192.168.1.50:5173',
    });
    expect(JSON.stringify(res.body)).not.toContain('sk-test-secret');
  });
});

describe('misc', () => {
  it('returns JSON 404s for unknown API routes', async () => {
    const { as } = await testApp();
    const res = await as('get', '/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
