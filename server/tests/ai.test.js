import { describe, it, expect } from 'vitest';
import { createAiService, AiNotConfiguredError, AiBudgetExceededError, AiExtractionError } from '../services/ai.js';
import { costMicroUsd, microToUsd } from '../lib/aiCost.js';
import { testConfig, testDb, addCompanyWithUser, silentLogger } from './helpers.js';
import { fakeClient, ORDER_EMAIL, ORDER_EMAIL_OUTPUT } from './fixtures.js';

const now = () => new Date('2026-10-03T08:00:00Z');

function setup({ client, budget, model } = {}) {
  const config = testConfig({
    ANTHROPIC_API_KEY: 'sk-test',
    ...(budget != null ? { AI_MONTHLY_BUDGET_USD: String(budget) } : {}),
    ...(model ? { ANTHROPIC_MODEL: model } : {}),
  });
  const db = testDb();
  const { companyId } = addCompanyWithUser(db);
  const ai = createAiService({ db, config, client, now, logger: silentLogger });
  return { db, ai, companyId };
}

describe('cost', () => {
  it('prices tokens per model, thinking billed as output', () => {
    expect(costMicroUsd('claude-opus-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(5_000_000);
    expect(costMicroUsd('claude-opus-5', { input_tokens: 2400, output_tokens: 600 })).toBe(27_000);
    expect(costMicroUsd('claude-sonnet-5', { input_tokens: 2400, output_tokens: 600 })).toBe(10_800);
    expect(costMicroUsd('claude-opus-5', { cache_read_input_tokens: 10_000 })).toBe(5_000);
    expect(costMicroUsd('unknown-model', { input_tokens: 1000 })).toBe(10_000); // priced at the top tier
    expect(microToUsd(27_000)).toBe(0.03);
  });
});

describe('ai.extractOrder', () => {
  it('prices a call at the model that answered, after a fallback', async () => {
    const client = fakeClient({ parsed_output: ORDER_EMAIL_OUTPUT, model: 'claude-opus-4-8' });
    const { ai, db, companyId } = setup({ client });
    const r = await ai.extractOrder({ companyId, companyName: 'Teståkeriet AB', text: ORDER_EMAIL });
    const row = db.prepare('SELECT model, cost_micro_usd FROM ai_extractions WHERE id = ?').get(r.extractionId);
    expect(row).toEqual({ model: 'claude-opus-4-8', cost_micro_usd: 27_000 });
  });

  it('sends Haiku without fallbacks, thinking or effort', async () => {
    const client = fakeClient({ parsed_output: ORDER_EMAIL_OUTPUT });
    const { ai, companyId } = setup({ client, model: 'claude-haiku-4-5' });
    await ai.extractOrder({ companyId, companyName: 'Teståkeriet AB', text: ORDER_EMAIL });
    const req = client.calls[0];
    expect(req.fallbacks).toBeUndefined();
    expect(req.betas).toBeUndefined();
    expect(req.thinking).toBeUndefined();
  });

  it('calls the configured model with structured output and logs usage and cost', async () => {
    const client = fakeClient({ parsed_output: ORDER_EMAIL_OUTPUT });
    const { ai, db, companyId } = setup({ client });
    const r = await ai.extractOrder({ companyId, companyName: 'Teståkeriet AB', text: ORDER_EMAIL });

    const req = client.calls[0];
    expect(req.model).toBe('claude-opus-5-5');
    // Declined requests are re-run server-side on Anthropic's recommended fallback model.
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(req.fallbacks).toBe('default');
    expect(req.thinking).toEqual({ type: 'adaptive' });
    expect(req.output_config.effort).toBe('low');
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.messages[0].content).toContain(ORDER_EMAIL);
    expect(req.messages[0].content).toContain('2026-10-03 (lördag)');

    expect(r.fields.telefon.value).toBe('+46701740610');
    const row = db.prepare('SELECT * FROM ai_extractions WHERE id = ?').get(r.extractionId);
    // claude-opus-5-5: $4 / $20 per million tokens.
    expect(row).toMatchObject({ kind: 'order', model: 'claude-opus-5-5', input_tokens: 2400, output_tokens: 600, cost_micro_usd: 21_600, error: null });
    expect(JSON.parse(row.fields_json).fields.kund.value).toBe('Norrbacka Mark & Anläggning AB');
  });

  it('omits adaptive thinking and effort for Haiku', async () => {
    const client = fakeClient({ parsed_output: ORDER_EMAIL_OUTPUT });
    const { ai, companyId } = setup({ client, model: 'claude-haiku-4-5' });
    await ai.extractOrder({ companyId, companyName: 'X', text: ORDER_EMAIL });
    expect(client.calls[0].thinking).toBeUndefined();
    expect(client.calls[0].output_config.effort).toBeUndefined();
  });

  it.each([
    [{ stop_reason: 'refusal', parsed_output: null }, 'refusal'],
    [{ stop_reason: 'max_tokens', parsed_output: null }, 'truncated'],
    [{ parsed_output: null }, 'invalid_output'],
  ])('raises (never invents data) and logs the failed call: %o', async (response, reason) => {
    const { ai, db, companyId } = setup({ client: fakeClient(response) });
    await expect(ai.extractOrder({ companyId, companyName: 'X', text: ORDER_EMAIL })).rejects.toMatchObject({ reason });
    const row = db.prepare('SELECT error, cost_micro_usd FROM ai_extractions').get();
    expect(row.error).toBe(reason);
    expect(row.cost_micro_usd).toBeGreaterThan(0); // failed calls still cost money
  });

  it('wraps API errors', async () => {
    const err = Object.assign(new Error('overloaded'), { status: 529 });
    const { ai, db, companyId } = setup({ client: fakeClient(err) });
    const p = ai.extractOrder({ companyId, companyName: 'X', text: ORDER_EMAIL });
    await expect(p).rejects.toBeInstanceOf(AiExtractionError);
    await expect(p).rejects.toMatchObject({ reason: 'api_error' });
    expect(db.prepare('SELECT error FROM ai_extractions').pluck().get()).toMatch(/^529/);
  });

  it('refuses when no API key is configured', async () => {
    const config = testConfig();
    const db = testDb();
    const { companyId } = addCompanyWithUser(db);
    const ai = createAiService({ db, config, logger: silentLogger });
    expect(ai.configured).toBe(false);
    await expect(ai.extractOrder({ companyId, companyName: 'X', text: ORDER_EMAIL })).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it('enforces the monthly budget before calling the API', async () => {
    const client = fakeClient({ parsed_output: ORDER_EMAIL_OUTPUT });
    const { ai, db, companyId } = setup({ client, budget: 1 });
    // Last month's spend doesn't count; this month's does.
    db.prepare(`INSERT INTO ai_extractions (company_id, kind, model, prompt_version, cost_micro_usd, created_at)
      VALUES (?, 'order', 'm', 'v', 5000000, '2026-09-29T10:00:00.000Z')`).run(companyId);
    await ai.extractOrder({ companyId, companyName: 'X', text: ORDER_EMAIL });

    db.prepare(`INSERT INTO ai_extractions (company_id, kind, model, prompt_version, cost_micro_usd, created_at)
      VALUES (?, 'order', 'm', 'v', 1000000, '2026-10-01T06:00:00.000Z')`).run(companyId);
    await expect(ai.extractOrder({ companyId, companyName: 'X', text: ORDER_EMAIL })).rejects.toBeInstanceOf(AiBudgetExceededError);
    expect(client.calls).toHaveLength(1);

    expect(ai.usage(companyId)).toMatchObject({ month_cost_usd: 1.02, budget_usd: 1, calls: 2 });
  });

  it('a zero budget disables AI', async () => {
    const client = fakeClient({ parsed_output: ORDER_EMAIL_OUTPUT });
    const { ai, companyId } = setup({ client, budget: 0 });
    await expect(ai.extractOrder({ companyId, companyName: 'X', text: ORDER_EMAIL })).rejects.toBeInstanceOf(AiBudgetExceededError);
    expect(client.calls).toHaveLength(0);
  });
});
