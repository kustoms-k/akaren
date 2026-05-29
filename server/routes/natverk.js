import { Router } from 'express';
import db from '../db.js';

const router = Router();

// ── Partners ──────────────────────────────────────────────────────────────────

router.get('/partners', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM job_referrals r WHERE r.partner_company_id = p.id AND r.riktning = 'ut') AS skickade_jobb,
      (SELECT COUNT(*) FROM job_referrals r WHERE r.partner_company_id = p.id AND r.riktning = 'in') AS mottagna_jobb,
      (SELECT SUM(r.overenskommet_totalpris_sek * r.formedlingsavgift_pct / 100.0)
       FROM job_referrals r
       WHERE r.partner_company_id = p.id AND r.riktning = 'ut' AND r.status = 'utfört') AS intjanad_avgift_sek
    FROM partner_companies p
    WHERE p.company_id = ? AND p.aktiv = 1
    ORDER BY p.partner_name ASC
  `).all(req.companyId);
  res.json(rows);
});

router.post('/partners', (req, res) => {
  const { partner_name, org_nr, contact_name, contact_phone, contact_email, notes } = req.body ?? {};
  if (!partner_name?.trim()) return res.status(400).json({ error: 'partner_name required' });

  try {
    const r = db.prepare(`
      INSERT INTO partner_companies (company_id, partner_name, org_nr, contact_name, contact_phone, contact_email, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.companyId, partner_name.trim(), org_nr ?? null, contact_name ?? null,
           contact_phone ?? null, contact_email ?? null, notes ?? null);
    const row = db.prepare('SELECT * FROM partner_companies WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Partner already exists' });
    throw err;
  }
});

router.put('/partners/:id', (req, res) => {
  const { partner_name, org_nr, contact_name, contact_phone, contact_email, notes, aktiv } = req.body ?? {};
  const p = db.prepare('SELECT * FROM partner_companies WHERE id = ? AND company_id = ?').get(req.params.id, req.companyId);
  if (!p) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE partner_companies
    SET partner_name  = COALESCE(?, partner_name),
        org_nr        = COALESCE(?, org_nr),
        contact_name  = COALESCE(?, contact_name),
        contact_phone = COALESCE(?, contact_phone),
        contact_email = COALESCE(?, contact_email),
        notes         = COALESCE(?, notes),
        aktiv         = COALESCE(?, aktiv)
    WHERE id = ? AND company_id = ?
  `).run(partner_name ?? null, org_nr ?? null, contact_name ?? null,
         contact_phone ?? null, contact_email ?? null, notes ?? null,
         aktiv ?? null, req.params.id, req.companyId);

  res.json(db.prepare('SELECT * FROM partner_companies WHERE id = ?').get(req.params.id));
});

router.delete('/partners/:id', (req, res) => {
  const p = db.prepare('SELECT id FROM partner_companies WHERE id = ? AND company_id = ?').get(req.params.id, req.companyId);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE partner_companies SET aktiv = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Referrals ─────────────────────────────────────────────────────────────────

router.get('/referrals', (req, res) => {
  const { partner_id, riktning, status } = req.query;
  let where = 'r.company_id = ?';
  const params = [req.companyId];

  if (partner_id) { where += ' AND r.partner_company_id = ?'; params.push(partner_id); }
  if (riktning)   { where += ' AND r.riktning = ?';           params.push(riktning); }
  if (status)     { where += ' AND r.status = ?';             params.push(status); }

  const rows = db.prepare(`
    SELECT r.*, p.partner_name, p.contact_name, p.contact_phone
    FROM job_referrals r
    JOIN partner_companies p ON p.id = r.partner_company_id
    WHERE ${where}
    ORDER BY r.created_at DESC
  `).all(...params);
  res.json(rows);
});

router.post('/referrals', (req, res) => {
  const {
    partner_company_id, quote_id, riktning,
    lasttyp, upphämtning, leverans, datum,
    overenskommet_totalpris_sek, formedlingsavgift_pct = 10,
    noteringar,
  } = req.body ?? {};

  if (!partner_company_id || !riktning) {
    return res.status(400).json({ error: 'partner_company_id and riktning required' });
  }
  if (!['ut', 'in'].includes(riktning)) {
    return res.status(400).json({ error: 'riktning must be ut or in' });
  }

  const partner = db.prepare('SELECT id FROM partner_companies WHERE id = ? AND company_id = ? AND aktiv = 1')
    .get(partner_company_id, req.companyId);
  if (!partner) return res.status(404).json({ error: 'Partner not found' });

  const total = overenskommet_totalpris_sek ?? null;
  const pct   = formedlingsavgift_pct;
  const partnerPris = total != null ? Math.round(total * (1 - pct / 100)) : null;

  const r = db.prepare(`
    INSERT INTO job_referrals
      (company_id, partner_company_id, quote_id, riktning, lasttyp, upphämtning, leverans, datum,
       overenskommet_totalpris_sek, formedlingsavgift_pct, partner_pris_sek, noteringar)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.companyId, partner_company_id, quote_id ?? null, riktning,
    lasttyp ?? null, upphämtning ?? null, leverans ?? null, datum ?? null,
    total, pct, partnerPris, noteringar ?? null,
  );

  const row = db.prepare(`
    SELECT r.*, p.partner_name FROM job_referrals r
    JOIN partner_companies p ON p.id = r.partner_company_id
    WHERE r.id = ?
  `).get(r.lastInsertRowid);
  res.status(201).json(row);
});

router.put('/referrals/:id', (req, res) => {
  const { status, noteringar, overenskommet_totalpris_sek, formedlingsavgift_pct } = req.body ?? {};
  const ref = db.prepare('SELECT * FROM job_referrals WHERE id = ? AND company_id = ?').get(req.params.id, req.companyId);
  if (!ref) return res.status(404).json({ error: 'Not found' });

  const validStatuses = ['föreslagen', 'accepterad', 'avvisad', 'utfört'];
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const newTotal = overenskommet_totalpris_sek ?? ref.overenskommet_totalpris_sek;
  const newPct   = formedlingsavgift_pct ?? ref.formedlingsavgift_pct;
  const newPartnerPris = newTotal != null ? Math.round(newTotal * (1 - newPct / 100)) : null;

  db.prepare(`
    UPDATE job_referrals
    SET status                      = COALESCE(?, status),
        noteringar                  = COALESCE(?, noteringar),
        overenskommet_totalpris_sek = ?,
        formedlingsavgift_pct       = ?,
        partner_pris_sek            = ?,
        updated_at                  = datetime('now')
    WHERE id = ? AND company_id = ?
  `).run(status ?? null, noteringar ?? null, newTotal, newPct, newPartnerPris, req.params.id, req.companyId);

  res.json(db.prepare(`
    SELECT r.*, p.partner_name FROM job_referrals r
    JOIN partner_companies p ON p.id = r.partner_company_id
    WHERE r.id = ?
  `).get(req.params.id));
});

// ── Settlement ────────────────────────────────────────────────────────────────
// GET /settlement/:partnerId?month=YYYY-MM  (defaults to current month)

router.get('/settlement/:partnerId', (req, res) => {
  const partner = db.prepare('SELECT * FROM partner_companies WHERE id = ? AND company_id = ?')
    .get(req.params.partnerId, req.companyId);
  if (!partner) return res.status(404).json({ error: 'Partner not found' });

  const month = req.query.month ?? new Date().toISOString().slice(0, 7);
  const from  = `${month}-01`;
  const to    = `${month}-31`;

  const utRows = db.prepare(`
    SELECT * FROM job_referrals
    WHERE company_id = ? AND partner_company_id = ? AND riktning = 'ut'
      AND created_at BETWEEN ? AND ?
    ORDER BY created_at ASC
  `).all(req.companyId, req.params.partnerId, from, to + ' 23:59:59');

  const inRows = db.prepare(`
    SELECT * FROM job_referrals
    WHERE company_id = ? AND partner_company_id = ? AND riktning = 'in'
      AND created_at BETWEEN ? AND ?
    ORDER BY created_at ASC
  `).all(req.companyId, req.params.partnerId, from, to + ' 23:59:59');

  const sumUtfört = (rows) => rows
    .filter((r) => r.status === 'utfört')
    .reduce((acc, r) => acc + (r.overenskommet_totalpris_sek ?? 0), 0);

  const avgiftUtfört = (rows) => rows
    .filter((r) => r.status === 'utfört')
    .reduce((acc, r) => acc + ((r.overenskommet_totalpris_sek ?? 0) * r.formedlingsavgift_pct / 100), 0);

  const utTotal     = sumUtfört(utRows);
  const inTotal     = sumUtfört(inRows);
  const utAvgift    = avgiftUtfört(utRows);   // we earn this (skickade ut)
  const inAvgift    = avgiftUtfört(inRows);   // we owe this  (mottagna)
  const netBalance  = Math.round(utAvgift - inAvgift);

  res.json({
    partner,
    month,
    ut: {
      jobb:    utRows.length,
      utfört:  utRows.filter((r) => r.status === 'utfört').length,
      total_sek:   Math.round(utTotal),
      avgift_sek:  Math.round(utAvgift),
      rows:    utRows,
    },
    in: {
      jobb:    inRows.length,
      utfört:  inRows.filter((r) => r.status === 'utfört').length,
      total_sek:   Math.round(inTotal),
      avgift_sek:  Math.round(inAvgift),
      rows:    inRows,
    },
    net_balance_sek: netBalance,
    de_skyldig_oss:  netBalance > 0,
  });
});

// ── Stats (for page header KPIs) ──────────────────────────────────────────────

router.get('/stats', (req, res) => {
  const partners      = db.prepare('SELECT COUNT(*) AS n FROM partner_companies WHERE company_id = ? AND aktiv = 1').get(req.companyId).n;
  const aktiva        = db.prepare("SELECT COUNT(*) AS n FROM job_referrals WHERE company_id = ? AND status IN ('föreslagen','accepterad')").get(req.companyId).n;
  const pending_sek   = db.prepare("SELECT COALESCE(SUM(overenskommet_totalpris_sek * formedlingsavgift_pct / 100.0),0) AS s FROM job_referrals WHERE company_id = ? AND riktning = 'ut' AND status IN ('föreslagen','accepterad')").get(req.companyId).s;
  const intjänat_sek  = db.prepare("SELECT COALESCE(SUM(overenskommet_totalpris_sek * formedlingsavgift_pct / 100.0),0) AS s FROM job_referrals WHERE company_id = ? AND riktning = 'ut' AND status = 'utfört'").get(req.companyId).s;
  res.json({ partners, aktiva, pending_sek: Math.round(pending_sek), intjänat_sek: Math.round(intjänat_sek) });
});

export default router;
