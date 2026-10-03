import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { requiredText, optionalText, orgNr, phone, email, postnr } from '../lib/schemas.js';

const SAFE_COLUMNS = `id, name, org_nr, address, postnr, ort, phone, email, bankgiro,
  retention_months, default_vat_mode, fortnox_status, created_at`;

const patchSchema = z.object({
  name: requiredText(200).optional(),
  org_nr: orgNr,
  address: optionalText(200),
  postnr,
  ort: optionalText(100),
  phone,
  email,
  bankgiro: optionalText(20),
  retention_months: z.coerce.number().int()
    .min(12, 'Minst 12 månader.').max(120, 'Högst 120 månader.').optional(),
  default_vat_mode: z.enum(['normal', 'omvand_bygg'], { error: 'Ogiltigt momsläge.' }).optional(),
}).strict();

export function settingsRouter({ db, audit, config, fortnox, sms }) {
  const router = Router();
  const stmtGet = db.prepare(`SELECT ${SAFE_COLUMNS} FROM companies WHERE id = ?`);

  router.get('/', (req, res) => {
    res.json(stmtGet.get(req.companyId));
  });

  // What is configured on this server; never returns secrets.
  router.get('/integrations', (req, res) => {
    res.json({
      ai: { configured: Boolean(config.anthropic.apiKey), model: config.anthropic.model },
      sms: { enabled: sms.enabled, sender: config.elks.sender },
      fortnox: fortnox.getStatus(req.companyId),
      public_base_url: config.publicBaseUrl,
    });
  });

  router.patch('/', (req, res) => {
    const data = validate(patchSchema, req.body);
    const keys = Object.keys(data);
    const before = stmtGet.get(req.companyId);
    if (keys.length > 0) {
      const sets = keys.map((k) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE companies SET ${sets} WHERE id = @id`).run({ ...data, id: req.companyId });
    }
    const after = stmtGet.get(req.companyId);
    audit({ ...officeActor(req), entity: 'company', entityId: req.companyId, action: 'update', before, after });
    res.json(after);
  });

  return router;
}
