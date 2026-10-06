import { describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { createApp } from '../app.js';
import { addUser, createCompany, generatePassword, listCompanies } from '../lib/accounts.js';
import { resetDemo } from '../seed/resetDemo.js';
import { TEST_ENV, testApp, testConfig, testDb, silentLogger } from './helpers.js';

describe('hosting config', () => {
  it('trusts the loopback proxy by default and a hop count behind Caddy', () => {
    expect(loadConfig(TEST_ENV).trustProxy).toBe('loopback');
    expect(loadConfig({ ...TEST_ENV, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(() => loadConfig({ ...TEST_ENV, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('only allows the nightly demo reset together with DEMO_MODE, and never DEMO_MODE in production', () => {
    expect(() => loadConfig({ ...TEST_ENV, DEMO_AUTO_RESET: '1' })).toThrow(/DEMO_AUTO_RESET/);
    expect(loadConfig({ ...TEST_ENV, DEMO_MODE: '1', DEMO_AUTO_RESET: '1' }).demoAutoReset).toBe(true);
    expect(() => loadConfig({ ...TEST_ENV, NODE_ENV: 'production', DEMO_MODE: '1' })).toThrow(/DEMO_MODE/);
  });

  it('uses the client IP from the proxy for the login limit', async () => {
    const config = testConfig({ TRUST_PROXY: '1' });
    const app = createApp({ config, db: testDb(), logger: silentLogger });
    const attempt = (ip) => request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ email: 'x@y.se', password: 'fel' });
    for (let i = 0; i < 10; i++) expect((await attempt('203.0.113.7')).status).toBe(401);
    expect((await attempt('203.0.113.7')).status).toBe(429);
    // Another customer behind the same proxy isn't locked out.
    expect((await attempt('198.51.100.20')).status).toBe(401);
  });
});

describe('accounts', () => {
  it('creates a company with its first office user and a readable password that works', async () => {
    const db = testDb();
    const r = createCompany(db, { name: 'Bergs Åkeri AB', orgNr: '5560360793', email: 'Kontor@BergsAkeri.se', userName: 'Anna Berg' });
    expect(r.password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(db.prepare('SELECT name, org_nr FROM companies WHERE id = ?').get(r.companyId)).toEqual({ name: 'Bergs Åkeri AB', org_nr: '556036-0793' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.userId);
    expect(user).toMatchObject({ company_id: r.companyId, name: 'Anna Berg', email: 'kontor@bergsakeri.se' });
    expect(bcrypt.compareSync(r.password, user.password_hash)).toBe(true);

    const app = createApp({ config: testConfig(), db, logger: silentLogger });
    const login = await request(app).post('/api/auth/login').send({ email: 'kontor@bergsakeri.se', password: r.password });
    expect(login.status).toBe(200);
    expect(login.body.company.name).toBe('Bergs Åkeri AB');

    const second = addUser(db, { companyId: r.companyId, email: 'lars@bergsakeri.se', userName: 'Lars' });
    expect(second.password).not.toBe(r.password);
    expect(listCompanies(db)).toEqual([expect.objectContaining({ name: 'Bergs Åkeri AB', users: 2, lass: 0 })]);
  });

  it('refuses duplicates and bad input', () => {
    const db = testDb();
    createCompany(db, { name: 'A AB', email: 'a@a.se' });
    expect(() => createCompany(db, { name: 'B AB', email: 'a@a.se' })).toThrow(/already exists/);
    expect(() => createCompany(db, { name: '', email: 'b@b.se' })).toThrow(/name/);
    expect(() => createCompany(db, { name: 'C AB', email: 'nope' })).toThrow(/email/);
    expect(() => createCompany(db, { name: 'C AB', email: 'c@c.se', orgNr: '123' })).toThrow(/organisationsnummer/);
    expect(() => addUser(db, { companyId: 99, email: 'd@d.se' })).toThrow(/No company/);
    expect(new Set(Array.from({ length: 20 }, generatePassword)).size).toBe(20);
  });
});

describe('changing the password', () => {
  it('needs the current password and at least 10 characters, and then the new one works', async () => {
    const { app, as, user } = await testApp();
    expect((await as('post', '/api/auth/password').send({ current_password: 'fel', new_password: 'ett-nytt-lösen' })).status).toBe(400);
    const short = await as('post', '/api/auth/password').send({ current_password: user.password, new_password: 'kort' });
    expect(short.status).toBe(400);
    expect(short.body.error.fields.new_password).toMatch(/10/);
    const ok = await as('post', '/api/auth/password').send({ current_password: user.password, new_password: 'ett-nytt-lösen' });
    expect(ok.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: user.password })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'ett-nytt-lösen' })).status).toBe(200);
    expect((await request(app).post('/api/auth/password').send({ current_password: 'x', new_password: 'y'.repeat(12) })).status).toBe(401);
  });
});

describe('hosted demo instance', () => {
  it('seeds an empty database and refuses to run outside DEMO_MODE', async () => {
    const db = testDb();
    const config = testConfig({ DATA_DIR: mkdtempSync(join(tmpdir(), 'akaren-test-')), DEMO_MODE: '1', DEMO_AUTO_RESET: '1' });
    const s = await resetDemo({ db, config, logger: silentLogger });
    expect(s.lass).toBeGreaterThan(100);
    expect(db.prepare('SELECT COUNT(*) FROM weigh_lists').pluck().get()).toBe(1);
    await expect(resetDemo({ db, config: testConfig(), logger: silentLogger })).rejects.toThrow(/DEMO_MODE/);
  }, 30_000);
});

describe('deploy files', () => {
  const root = new URL('../../', import.meta.url);
  const read = (p) => readFileSync(new URL(p, root), 'utf8');

  it('never let the real app run in demo mode, and never give the demo real keys', () => {
    const compose = read('deploy/compose.yaml');
    const app = compose.slice(compose.indexOf('\n  app:'), compose.indexOf('\n  demo:'));
    const demo = compose.slice(compose.indexOf('\n  demo:'), compose.indexOf('\n  caddy:'));
    expect(app).toMatch(/NODE_ENV: production/);
    expect(app).toMatch(/DEMO_MODE: "0"/);
    expect(demo).toMatch(/DEMO_MODE: "1"/);
    for (const key of ['ANTHROPIC_API_KEY', 'ELKS_USERNAME', 'ELKS_PASSWORD', 'SMTP_HOST', 'FORTNOX_CLIENT_ID']) expect(demo).toMatch(new RegExp(`${key}: ""`));
  });

  it('keep data and secrets out of the image', () => {
    const ignore = read('.dockerignore');
    for (const p of ['server/data', '**/.env', '**/*.db', '**/node_modules']) expect(ignore).toContain(p);
    expect(read('Dockerfile')).toMatch(/rm -rf server\/data server\/backups server\/\.env/);
  });
});
