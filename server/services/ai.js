import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { costMicroUsd, microToUsd } from '../lib/aiCost.js';
import { stockholmDate, stockholmMonthStartUtc } from '../lib/dates.js';
import {
  ORDER_PROMPT_VERSION, OrderExtractionSchema, buildOrderSystemPrompt, buildOrderUserMessage, postProcessOrder,
} from '../lib/orderExtraction.js';
import {
  VAGSEDEL_PROMPT_VERSION, VagsedelSchema, buildVagsedelSystemPrompt, buildVagsedelUserText, postProcessVagsedel,
} from '../lib/vagsedelExtraction.js';

export class AiNotConfiguredError extends Error {
  constructor() { super('ANTHROPIC_API_KEY is not set'); this.code = 'ai_not_configured'; }
}
export class AiBudgetExceededError extends Error {
  constructor(spentUsd, budgetUsd) {
    super(`Monthly AI budget reached (${spentUsd} of ${budgetUsd} USD)`);
    this.code = 'ai_budget_exceeded';
    this.spentUsd = spentUsd;
    this.budgetUsd = budgetUsd;
  }
}
/** reason: 'api_error' | 'refusal' | 'truncated' | 'invalid_output' */
export class AiExtractionError extends Error {
  constructor(reason, cause) {
    super(`AI extraction failed: ${reason}`);
    this.code = 'ai_extraction_failed';
    this.reason = reason;
    this.cause = cause;
  }
}

/** Request options per model family. Haiku 4.5 takes neither adaptive thinking nor effort. */
function requestOptions(model, format) {
  if (model.startsWith('claude-haiku')) return { output_config: { format } };
  // Extraction is a reading task: low effort keeps latency and cost down.
  return { thinking: { type: 'adaptive' }, output_config: { effort: 'low', format } };
}

/**
 * Claude-backed extraction. Every call is logged to ai_extractions with token usage and
 * estimated cost; a per-company monthly budget is enforced before each call.
 * Failures are raised, never replaced with made-up data.
 */
export function createAiService({ db, config, client, now = () => new Date(), logger = console }) {
  const ai = config.anthropic;
  const sdk = client ?? (ai.apiKey
    ? new Anthropic({ apiKey: ai.apiKey, ...(ai.baseUrl ? { baseURL: ai.baseUrl } : {}), maxRetries: 2, timeout: 120_000 })
    : null);

  const stmtInsert = db.prepare(`
    INSERT INTO ai_extractions (company_id, kind, model, prompt_version, input_text, input_photo_id, fields_json,
      confidence_json, raw_response, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      latency_ms, stop_reason, cost_micro_usd, error, created_at)
    VALUES (@company_id, @kind, @model, @prompt_version, @input_text, @input_photo_id, @fields_json,
      @confidence_json, @raw_response, @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
      @latency_ms, @stop_reason, @cost_micro_usd, @error, @created_at)
  `);
  const stmtMonth = db.prepare(`
    SELECT COALESCE(SUM(cost_micro_usd), 0) AS micro, COUNT(*) AS calls
    FROM ai_extractions WHERE company_id = ? AND created_at >= ?
  `);

  function usage(companyId) {
    const { micro, calls } = stmtMonth.get(companyId, stockholmMonthStartUtc(now()));
    return { month_cost_usd: microToUsd(micro), budget_usd: ai.monthlyBudgetUsd, calls, model: ai.model, configured: Boolean(sdk) };
  }

  function assertBudget(companyId) {
    const { micro } = stmtMonth.get(companyId, stockholmMonthStartUtc(now()));
    if (micro >= ai.monthlyBudgetUsd * 1_000_000) throw new AiBudgetExceededError(microToUsd(micro), ai.monthlyBudgetUsd);
  }

  function log(row) {
    return Number(stmtInsert.run({
      input_text: null, input_photo_id: null, fields_json: null, confidence_json: null, raw_response: null,
      input_tokens: null, output_tokens: null, cache_read_tokens: null, cache_write_tokens: null,
      stop_reason: null, cost_micro_usd: 0, error: null, created_at: now().toISOString(),
      ...row,
    }).lastInsertRowid);
  }

  /**
   * One structured-output call: budget check, request, usage/cost logging, failure handling.
   * `postProcess(parsed)` returns { fields, warnings }. Returns { extractionId, fields, warnings, model }.
   */
  async function run({ companyId, kind, promptVersion, inputText = null, inputPhotoId = null, schema, system, content, postProcess }) {
    if (!sdk) throw new AiNotConfiguredError();
    assertBudget(companyId);

    const base = { company_id: companyId, kind, model: ai.model, prompt_version: promptVersion, input_text: inputText, input_photo_id: inputPhotoId };
    const started = Date.now();

    let response;
    try {
      response = await sdk.messages.parse({
        model: ai.model,
        max_tokens: 16000,
        ...requestOptions(ai.model, zodOutputFormat(schema)),
        system,
        messages: [{ role: 'user', content }],
      });
    } catch (err) {
      logger.error(`[ai] ${kind} extraction request failed:`, err?.status ?? '', err?.message);
      log({ ...base, latency_ms: Date.now() - started, error: `${err?.status ?? 'network'}: ${err?.message ?? err}`.slice(0, 500) });
      throw new AiExtractionError('api_error', err);
    }

    const u = response.usage ?? {};
    const metrics = {
      model: response.model ?? ai.model,
      input_tokens: u.input_tokens ?? null,
      output_tokens: u.output_tokens ?? null,
      cache_read_tokens: u.cache_read_input_tokens ?? null,
      cache_write_tokens: u.cache_creation_input_tokens ?? null,
      latency_ms: Date.now() - started,
      stop_reason: response.stop_reason ?? null,
      cost_micro_usd: costMicroUsd(ai.model, u),
    };

    const failure =
      response.stop_reason === 'refusal' ? 'refusal'
      : response.stop_reason === 'max_tokens' ? 'truncated'
      : response.parsed_output == null ? 'invalid_output'
      : null;
    if (failure) {
      log({ ...base, ...metrics, error: failure });
      throw new AiExtractionError(failure);
    }

    const { fields, warnings } = postProcess(response.parsed_output);
    const extractionId = log({
      ...base,
      ...metrics,
      fields_json: JSON.stringify({ fields, warnings }),
      confidence_json: JSON.stringify(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.confidence]))),
      raw_response: JSON.stringify(response.parsed_output),
    });
    return { extractionId, fields, warnings, model: metrics.model };
  }

  /** Extract a structured order from pasted text. */
  function extractOrder({ companyId, companyName, text }) {
    const today = stockholmDate(now());
    return run({
      companyId, kind: 'order', promptVersion: ORDER_PROMPT_VERSION, inputText: text,
      schema: OrderExtractionSchema,
      system: buildOrderSystemPrompt(),
      content: buildOrderUserMessage(text, { today, companyName }),
      postProcess: (parsed) => postProcessOrder(parsed, { today }),
    });
  }

  /** Read a photographed vågsedel (JPEG bytes). Context is used only for validation, not shown to the model. */
  function extractVagsedel({ companyId, photoId, jpeg, assignmentDate, assignedRegnr }) {
    const today = stockholmDate(now());
    return run({
      companyId, kind: 'vagsedel', promptVersion: VAGSEDEL_PROMPT_VERSION, inputPhotoId: photoId,
      schema: VagsedelSchema,
      system: buildVagsedelSystemPrompt(),
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
        { type: 'text', text: buildVagsedelUserText({ today }) },
      ],
      postProcess: (parsed) => postProcessVagsedel(parsed, { today, assignmentDate, assignedRegnr }),
    });
  }

  return { configured: Boolean(sdk), usage, extractOrder, extractVagsedel };
}
