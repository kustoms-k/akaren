import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../lib/http.js';
import { currentIsoWeek } from '../lib/dates.js';
import { shiftWeek } from '../lib/weeks.js';
import { resetDemo } from '../seed/resetDemo.js';
import { ekbackaListText, invoiceSpecText } from '../seed/weighList.js';

const resetSchema = z.object({ confirm: z.literal('ÅTERSTÄLL', { error: 'Skriv ÅTERSTÄLL för att bekräfta.' }) }).strict();

/**
 * Tools for showing Lasskoll to prospects (/api/demo). Mounted only with DEMO_MODE=1, which the config refuses in
 * production, so none of this exists on a real installation.
 */
export function demoRouter({ db, config, audit, logger = console }) {
  const router = Router();

  // Wipe the database and seed fresh demo data dated around today, so every meeting starts from the same story.
  router.post('/reset', asyncHandler(async (req, res) => {
    validate(resetSchema, req.body);
    const s = await resetDemo({ db, config, audit, logger, waitForPhotos: false });
    res.json({ ok: true, lass: s.lass, previous_week: s.previousWeek, current_week: s.currentWeek });
  }));

  // Example files for Förlustkontroll: last week's Ekbacka weighing list and an invoice specification for it.
  router.get('/forlustkontroll-exempel', (req, res) => {
    const week = shiftWeek(currentIsoWeek(), -1);
    res.json({
      facility_name: 'Ekbacka massmottagning',
      facility_orgnr: '559404-1236',
      prospect_name: 'Lagerviks Åkeri AB',
      vaglista: { name: `vagningsrapport-ekbacka-${week.toLowerCase()}.csv`, text: ekbackaListText(db, { companyId: req.companyId, week }) },
      faktura: { name: `fakturaspecifikation-${week.toLowerCase()}.csv`, text: invoiceSpecText(db, { companyId: req.companyId, week }) },
    });
  });

  return router;
}
