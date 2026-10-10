import bcrypt from 'bcryptjs';
import request from 'supertest';
import { loadConfig } from '../config.js';
import { openDb, migrate } from '../db/index.js';
import { createApp } from '../app.js';

export const TEST_ENV = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:5173',
  PUBLIC_BASE_URL: 'http://192.168.1.50:5173',
  JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  ENCRYPTION_KEY: '0'.repeat(64),
  DATA_DIR: '/tmp/akaren-test-unused',
  DEMO_FULL: '0',
};

export const silentLogger = { log() {}, error() {}, warn() {} };

export function testConfig(overrides = {}) {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

export function testDb() {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

/** Insert a company and an office user; returns their ids. */
export function addCompanyWithUser(db, { email = 'kontor@test.se', password = 'hemligt123', name = 'Test AB' } = {}) {
  const companyId = Number(db.prepare('INSERT INTO companies (name) VALUES (?)').run(name).lastInsertRowid);
  const userId = Number(db.prepare('INSERT INTO users (company_id, name, email, password_hash) VALUES (?, ?, ?, ?)')
    .run(companyId, 'Kontoret', email, bcrypt.hashSync(password, 4)).lastInsertRowid);
  return { companyId, userId, email, password };
}

/** App + db + logged-in supertest agent helpers. */
export async function testApp({ services = {}, configOverrides = {} } = {}) {
  const config = testConfig(configOverrides);
  const db = testDb();
  const user = addCompanyWithUser(db);
  const app = createApp({ config, db, services, logger: silentLogger });
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
  const token = res.body.token;
  const as = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
  return { app, db, config, user, token, as };
}
