import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';
import { TEST_ENV } from './helpers.js';

describe('loadConfig', () => {
  it('builds a config from a valid env', () => {
    const c = loadConfig(TEST_ENV);
    expect(c.anthropic.model).toBe('claude-opus-5-5');
    expect(c.elks.sender).toBe('Lasskoll');
    expect(c.elks.enabled).toBe(false);
    expect(c.fortnox.configured).toBe(false);
    expect(c.corsOrigins).toEqual(['http://localhost:5173', 'http://192.168.1.50:5173']);
    expect(c.host).toBe('0.0.0.0');
  });

  it('refuses to start without secrets', () => {
    expect(() => loadConfig({ ...TEST_ENV, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...TEST_ENV, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...TEST_ENV, ENCRYPTION_KEY: '' })).toThrow(/ENCRYPTION_KEY/);
  });

  it('requires the URL settings', () => {
    expect(() => loadConfig({ ...TEST_ENV, PUBLIC_BASE_URL: '' })).toThrow(/PUBLIC_BASE_URL/);
    expect(() => loadConfig({ ...TEST_ENV, APP_URL: 'not a url' })).toThrow(/APP_URL/);
  });

  it('rejects a 46elks sender with Swedish characters', () => {
    expect(() => loadConfig({ ...TEST_ENV, ELKS_SENDER: 'Åkaren' })).toThrow(/ELKS_SENDER/);
    expect(() => loadConfig({ ...TEST_ENV, ELKS_SENDER: 'Teståkeriet' })).toThrow(/ELKS_SENDER/);
    expect(loadConfig({ ...TEST_ENV, ELKS_SENDER: 'Testakeriet' }).elks.sender).toBe('Testakeriet');
  });

  it('treats blank optional values as unset', () => {
    const c = loadConfig({ ...TEST_ENV, ANTHROPIC_MODEL: '', PORT: '', FORTNOX_REDIRECT_URI: '' });
    expect(c.anthropic.model).toBe('claude-opus-5-5');
    expect(c.port).toBe(3002);
    expect(c.fortnox.redirectUri).toBeNull();
  });
});
