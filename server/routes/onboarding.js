import { Router }         from 'express';
import { randomUUID }     from 'node:crypto';
import db                 from '../db.js';
import { getActiveFleet } from '../lib/fleet.js';
import fleetJson          from '../data/fleet.json' with { type: 'json' };

const router = Router();

// ── GET /lookup-org?orgnr=XXXXXXXXXX ─────────────────────────────────────────
// Best-effort lookup via bolaget.nu (free community API). Fails gracefully.
router.get('/lookup-org', async (req, res) => {
  const { orgnr } = req.query;
  if (!orgnr) return res.status(400).json({ error: 'orgnr required' });
  const clean = orgnr.replace(/[^0-9]/g, '');
  if (clean.length < 10) return res.json({ found: false });

  try {
    const r = await fetch(`https://bolaget.nu/api/v1/${clean}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Akaren-SaaS/1.0' },
      signal:  AbortSignal.timeout(4000),
    });
    if (!r.ok) return res.json({ found: false });
    const data = await r.json();
    res.json({
      found:   true,
      name:    data.company_name ?? data.name    ?? null,
      address: data.address      ?? data.visiting_street ?? null,
      city:    data.city         ?? data.municipality    ?? null,
    });
  } catch {
    res.json({ found: false });
  }
});

// ── PATCH /company — update basic company fields from onboarding step 1 ───────
router.patch('/company', (req, res) => {
  const { name, org_nr, address, phone, email, logo_url } = req.body;
  db.prepare(`
    UPDATE companies
    SET name     = COALESCE(?, name),
        org_nr   = COALESCE(?, org_nr),
        address  = COALESCE(?, address),
        phone    = COALESCE(?, phone),
        email    = COALESCE(?, email),
        logo_url = COALESCE(?, logo_url)
    WHERE id = ?
  `).run(
    name    ?? null, org_nr  ?? null, address ?? null,
    phone   ?? null, email   ?? null, logo_url ?? null,
    req.companyId,
  );
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.companyId);
  const { fortnox_token, ...safe } = row;
  res.json(safe);
});

// ── POST /save-pricing — persist pricing config from wizard step 3 ─────────────
router.post('/save-pricing', (req, res) => {
  const { pricing_config } = req.body;
  db.prepare('UPDATE companies SET pricing_config = ? WHERE id = ?')
    .run(JSON.stringify(pricing_config ?? {}), req.companyId);
  res.json({ ok: true });
});

// ── POST /complete — mark onboarding done ─────────────────────────────────────
router.post('/complete', (req, res) => {
  db.prepare(`UPDATE companies SET onboarding_completed_at = datetime('now') WHERE id = ?`)
    .run(req.companyId);
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.companyId);
  const { fortnox_token, ...safe } = row;
  res.json(safe);
});

// ── POST /dismiss-tour — record that this user dismissed the feature tour ─────
router.post('/dismiss-tour', (req, res) => {
  db.prepare(`UPDATE users SET tour_dismissed_at = datetime('now') WHERE id = ?`)
    .run(req.user.userId);
  res.json({ ok: true });
});

// ── GET /tour-status — check if current user dismissed tour ──────────────────
router.get('/tour-status', (req, res) => {
  const row = db.prepare('SELECT tour_dismissed_at FROM users WHERE id = ?')
    .get(req.user.userId);
  res.json({ dismissed: Boolean(row?.tour_dismissed_at) });
});

// ── POST /load-demo-data — populate full mock Stockholm trucking dataset ──────
router.post('/load-demo-data', (req, res) => {
  const cid = req.companyId;

  db.exec('BEGIN');
  try {
    // 1. Fleet — use all fleet.json presets
    const insFleet = db.prepare(`
      INSERT OR IGNORE INTO company_fleet
        (company_id, ext_id, reg, namn, lasttyp, typ, max_last_kg, volym_m3,
         lez_godkand, euro_klass, timkostnad_sek, tillstand, priskm_sek, startavgift_sek, beskrivning)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Only seed if company has no fleet yet
    const existing = db.prepare('SELECT COUNT(*) AS n FROM company_fleet WHERE company_id = ?').get(cid);
    if (existing.n === 0) {
      for (const v of fleetJson) {
        insFleet.run(
          cid, v.id, v.reg, v.namn, v.lasttyp, v.typ,
          v.maxLast_kg ?? null, v.volym_m3 ?? null,
          v['lez_godkänd'] ? 1 : 0, v.euro_klass ?? null,
          v.timkostnad_sek, JSON.stringify(v['tillstånd'] ?? []),
          v.priskm_sek, v.startavgift_sek, v.beskrivning ?? null,
        );
      }
    }

    // 2. Pricing config
    db.prepare('UPDATE companies SET pricing_config = ? WHERE id = ?').run(
      JSON.stringify({ fuel_cost_km: 2.50, markup_pct: 35 }), cid,
    );

    // 3. Demo customers with portals
    const insPortal = db.prepare(`
      INSERT INTO customer_portals
        (company_id, customer_name, customer_phone, customer_email, token, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const customers = [
      { name: 'Bergström Bygg AB',     phone: '+46701112233', email: 'info@bergstrombygg.se',     notes: 'Regelbunden kund — byggmaterial och maskiner.' },
      { name: 'Nordlund Logistik AB',  phone: '+46702223344', email: 'order@nordlundlogistik.se', notes: 'Stor aktör, alltid tidsbokning.' },
      { name: 'Hansson & Söner HB',    phone: '+46703334455', email: null,                        notes: null },
    ];
    const portalIds = customers.map((c) => {
      const r = insPortal.run(cid, c.name, c.phone, c.email, randomUUID(), c.notes);
      return r.lastInsertRowid;
    });

    // 4. Demo quotes (pre-accepted, various states)
    const insQuote = db.prepare(`
      INSERT INTO quotes
        (company_id, lasttyp, upphämtning, leverans, datum, fordon_id,
         avstand_km, totalpris_sek, status, customer_portal_id, customer_name,
         customer_phone, noteringar, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const demoQuotes = [
      { lasttyp: 'Byggmaterial', from: 'Arlanda flygplats, Sigtuna',   to: 'Solna Business Park, Solna',        km: 42,  price: 8900,  vehicle: 'KEM-03', portal: portalIds[0], name: customers[0].name, phone: customers[0].phone, note: 'Betong och armering. Tidigt morgon.', status: 'accepterad', daysAgo: 14 },
      { lasttyp: 'Maskintransport', from: 'Nacka Strand, Nacka',        to: 'Kungsholmen, Stockholm',            km: 18,  price: 14200, vehicle: 'KEM-07', portal: portalIds[0], name: customers[0].name, phone: customers[0].phone, note: 'Grävmaskin, tillstånd klart.', status: 'accepterad', daysAgo: 10 },
      { lasttyp: 'Frakt',         from: 'Stor-Stockholm lager, Upplands Väsby', to: 'Södertälje hamn, Södertälje', km: 67, price: 11400, vehicle: 'KEM-04', portal: portalIds[1], name: customers[1].name, phone: customers[1].phone, note: null, status: 'accepterad', daysAgo: 7 },
      { lasttyp: 'Kylfrakt',      from: 'Lidingö, Stockholm',          to: 'Uppsala centralstation, Uppsala',   km: 76,  price: 16800, vehicle: 'KEM-06', portal: portalIds[1], name: customers[1].name, phone: customers[1].phone, note: 'Livsmedel, temp max +4°C.', status: 'väntande', daysAgo: 2 },
      { lasttyp: 'Styckegods',    from: 'Farsta centrum, Stockholm',   to: 'Täby centrum, Täby',               km: 28,  price: 4200,  vehicle: 'KEM-01', portal: portalIds[2], name: customers[2].name, phone: customers[2].phone, note: null, status: 'väntande', daysAgo: 1 },
    ];
    const quoteIds = demoQuotes.map((q) => {
      const date = new Date();
      date.setDate(date.getDate() - q.daysAgo);
      const r = insQuote.run(
        cid, q.lasttyp, q.from, q.to,
        new Date(date.getTime() + 86400000).toISOString().slice(0, 10),
        q.vehicle, q.km, q.price, q.status,
        q.portal, q.name, q.phone, q.note,
        date.toISOString().replace('T', ' ').slice(0, 19),
      );
      return r.lastInsertRowid;
    });

    // 5. Demo jobs (for the accepted quotes)
    const insJob = db.prepare(`
      INSERT INTO jobs (company_id, quote_id, status, created_at)
      VALUES (?, ?, ?, ?)
    `);
    [0, 1, 2].forEach((i) => {
      const date = new Date();
      date.setDate(date.getDate() - demoQuotes[i].daysAgo + 1);
      insJob.run(cid, quoteIds[i], 'utfört', date.toISOString().replace('T', ' ').slice(0, 19));
    });

    // 6. Seed drivers if none exist for this company
    const driverCount = db.prepare('SELECT COUNT(*) AS n FROM drivers WHERE company_id = ?').get(cid);
    if (driverCount.n === 0) {
      const insDrv = db.prepare('INSERT INTO drivers (company_id, name, phone, truck_id) VALUES (?, ?, ?, ?)');
      [
        ['Erik Lindgren',    '+46701100001', fleetJson[0]?.id ?? 'V01'],
        ['Maja Svensson',    '+46701100002', fleetJson[1]?.id ?? 'V02'],
        ['Anders Björk',     '+46701100003', fleetJson[2]?.id ?? 'V03'],
        ['Sara Holmström',   '+46701100004', fleetJson[3]?.id ?? 'V04'],
        ['Mikael Gustafsson','+46701100005', fleetJson[4]?.id ?? 'V05'],
      ].forEach(([name, phone, truck_id]) => insDrv.run(cid, name, phone, truck_id));
    }

    // 7. Mark onboarding complete
    db.prepare(`UPDATE companies SET onboarding_completed_at = datetime('now') WHERE id = ?`).run(cid);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }

  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(cid);
  const { fortnox_token, ...safe } = row;
  res.json({ ok: true, company: safe });
});

export default router;
