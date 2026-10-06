import { Router } from 'express';
import { z } from 'zod';
import { badRequest, validate } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { optionalText, orgNr, requiredText } from '../lib/schemas.js';
import { FIELDS, WeighListError, parseWeighList, previewWeighList } from '../lib/weighList.js';
import { lossCheck } from '../lib/lossCheck.js';

const MAX_TEXT = 1_500_000;
const text = z.string({ error: 'Klistra in listan eller välj en fil.' }).min(1, 'Klistra in listan eller välj en fil.').max(MAX_TEXT, 'Listan är för stor.');
const mapping = z.object({
  columns: z.partialRecord(z.enum(FIELDS), z.number().int().min(0).max(200)),
  unit: z.enum(['kg', 'ton']),
}).strict();
const kr = z.preprocess((v) => (v === '' || v == null ? undefined : typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(',', '.')) : v),
  z.number({ error: 'Ange ett belopp i kronor.' }).positive('Ange ett belopp större än 0.').max(1_000_000).optional());

const previewSchema = z.object({ text, mapping: mapping.optional(), kind: z.enum(['vaglista', 'faktura']) }).strict();
const runSchema = z.object({
  weigh: z.object({ text, mapping }).strict(),
  invoice: z.object({ text, mapping }).strict(),
  facility_name: requiredText(120),
  facility_orgnr: orgNr,
  prospect_name: optionalText(120),
  price_ton_kr: kr,
  price_lass_kr: kr,
}).strict();

function parse(input, kind) {
  try {
    return parseWeighList(input.text, input.mapping, { kind });
  } catch (err) {
    if (err instanceof WeighListError) {
      throw badRequest(`${kind === 'faktura' ? 'Fakturaspecifikationen' : 'Våglistan'}: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Förlustkontroll (/api/forlustkontroll): a facility's weighing list against an invoice specification, to show
 * which weighed loads never reached an invoice and what they were worth. Stateless: the files are read, compared
 * and forgotten, so it can be run on a prospect's data. Only the counts are audited.
 */
export function forlustkontrollRouter({ audit }) {
  const router = Router();

  router.post('/preview', (req, res) => {
    const input = validate(previewSchema, req.body);
    try {
      res.json(previewWeighList(input.text, input.mapping ?? null, { kind: input.kind }));
    } catch (err) {
      if (err instanceof WeighListError) throw badRequest(err.message, { fields: { text: err.message } });
      throw err;
    }
  });

  router.post('/', (req, res) => {
    const input = validate(runSchema, req.body);
    const weigh = parse(input.weigh, 'vaglista');
    const invoice = parse(input.invoice, 'faktura');
    if (!weigh.rows.length) throw badRequest('Inga vägningar kunde läsas. Kontrollera kolumnerna.');
    if (!invoice.rows.length) throw badRequest('Inga fakturarader kunde läsas. Kontrollera kolumnerna.');
    const result = lossCheck({
      weighRows: weigh.rows, invoiceRows: invoice.rows,
      facility: { name: input.facility_name, orgnr: input.facility_orgnr ?? null },
      prices: {
        priceTonOre: input.price_ton_kr ? Math.round(input.price_ton_kr * 100) : null,
        priceLassOre: input.price_lass_kr ? Math.round(input.price_lass_kr * 100) : null,
      },
    });
    audit({
      ...officeActor(req), entity: 'loss_check', action: 'run',
      after: { weighed: result.totals.weighed, invoice_rows: result.totals.invoice_rows, missing: result.totals.missing, value_ore: result.totals.total_value_ore },
    });
    res.json({
      ...result,
      facility_name: input.facility_name,
      prospect_name: input.prospect_name ?? null,
      skipped: { weigh: weigh.skipped.length, invoice: invoice.skipped.length },
      generated_at: new Date().toISOString(),
    });
  });

  return router;
}
