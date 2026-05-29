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

    // 2. Pricing config (2026 Swedish haulage market rates)
    // Fuel cost/km based on diesel 21.50 kr/l × avg 0.35 l/km = 7.53 kr/km
    db.prepare('UPDATE companies SET pricing_config = ? WHERE id = ?').run(
      JSON.stringify({ fuel_cost_km: 7.53, markup_pct: 30 }), cid,
    );

    // 3. Demo customers with portals
    const insPortal = db.prepare(`
      INSERT INTO customer_portals
        (company_id, customer_name, customer_phone, customer_email, token, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const customers = [
      { name: 'NCC Anläggning AB',          phone: '+46706112233', email: 'transport@ncc.se',            notes: 'Regelbunden kund — byggmaskiner och anläggningstransporter. Kontakt: Anders Bergström.' },
      { name: 'Skanska Sverige AB',         phone: '+46707223344', email: 'logistik@skanska.se',         notes: 'Stor aktör, kräver alltid tidsbokning och leveransbekräftelse. Kontakt: Johan Lindqvist.' },
      { name: 'Mälardalens Schakt AB',      phone: '+46708334455', email: 'order@malardalensschakt.se',  notes: 'Lokalt schaktföretag, löpande maskin- och materialtransporter. Kontakt: Erik Nordin.' },
      { name: 'Stockholms Byggentreprenad', phone: '+46709445566', email: null,                          notes: 'Ny kund — provtransport bokad. Kontakt: Maria Sundberg.' },
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
    // Demo quotes with realistic 2026 Swedish haulage pricing:
    // Hourly: KEM-01 kran 1150 kr/h, KEM-03 flak 856 kr/h, KEM-04 boggi 792 kr/h, KEM-05 släp 1029 kr/h, KEM-06 container 920 kr/h
    // Milpris solobil 255 kr/mil (255 kr/10 km), bil+släp 315 kr/mil
    // Fuel: 21.50 kr/l diesel, KEM-01 3.8 l/mil, KEM-03 3.3 l/mil, KEM-04 3.1 l/mil, KEM-05 4.2 l/mil
    const demoQuotes = [
      // KEM-01 Kranbil: 12t grävmaskin Hornsgatan→Södertälje 38 km
      // 1.5h framkörning + 0.6h körning + 1h lastning = 3.1h → 4h billing (min 2h, round up)
      // 4h × 1150 = 4600 + lastning 1500 + bränsle 3.8 mil × 3.8 l/mil × 21.50 = 311 kr → total ~6400
      { lasttyp: 'Grävmaskin', from: 'Hornsgatan 36, Stockholm', to: 'Södertälje hamn, Södertälje', km: 38, price: 6500, vehicle: 'KEM-01', portal: portalIds[0], name: customers[0].name, phone: customers[0].phone, note: '12t bandgrävare. Tillstånd klart. Tidig morgon 06:00.', status: 'accepterad', daysAgo: 14 },
      // KEM-03 Flakbil: byggmaterial Arlanda→Solna 42 km
      // 1h framkörning + 0.7h körning + 0.5h lastning = 2.2h → 2.5h billing
      // 2.5h × 856 = 2140 + bränsle 4.2 mil × 3.3 × 21.50 = 298 → total ~2500
      { lasttyp: 'Byggmaterial', from: 'Arlanda logistikcentrum, Sigtuna', to: 'NCC Solna Business Park, Solna', km: 42, price: 4800, vehicle: 'KEM-03', portal: portalIds[0], name: customers[0].name, phone: customers[0].phone, note: 'Armering och betongblock. Morgonleverans 07:00.', status: 'accepterad', daysAgo: 10 },
      // KEM-05 Bil+Släp: frakt Upplands Väsby→Södertälje 67 km (>50 km → milpris)
      // 6.7 mil × 315 kr/mil = 2111 + bränsle 6.7 mil × 4.2 × 21.50 = 605 → total ~2800
      { lasttyp: 'Frakt', from: 'Stor-Stockholm lager, Upplands Väsby', to: 'Södertälje hamn, Södertälje', km: 67, price: 8900, vehicle: 'KEM-05', portal: portalIds[1], name: customers[1].name, phone: customers[1].phone, note: 'Pallar 22t nettolast. Kvittens krävs vid lossning.', status: 'accepterad', daysAgo: 7 },
      // KEM-06 Containerbil: Stockholm→Uppsala 76 km (>50 km → milpris)
      // 7.6 mil × 255 kr/mil = 1938 + bränsle 7.6 × 3.4 × 21.50 = 556 → ~2500
      { lasttyp: 'Containertransport', from: 'Frihamnen, Stockholm', to: 'Uppsala kombiterminal, Uppsala', km: 76, price: 7200, vehicle: 'KEM-06', portal: portalIds[1], name: customers[1].name, phone: customers[1].phone, note: '20-fots ISO-container, 18t. Tidsbokning kl 10:00.', status: 'väntande', daysAgo: 2 },
      // KEM-04 Boggi: schaktmaterial Nacka→Kungsholmen 22 km
      // 1h framkörning + 0.4h körning + 0.5h lastning = 1.9h → 2h billing (minimum)
      // 2h × 792 = 1584 + bränsle 2.2 × 3.1 × 21.50 = 147 → ~1800
      { lasttyp: 'Godstransport', from: 'Nacka Strand, Nacka', to: 'Kungsholmen, Stockholm', km: 22, price: 3200, vehicle: 'KEM-04', portal: portalIds[2], name: customers[2].name, phone: customers[2].phone, note: 'Schaktmassor, 8t. LEZ: Kungsholmen — KEM-04 Euro V, kontrollera tillstånd.', status: 'väntande', daysAgo: 1 },
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
        ['Anders Bergström',  '+46701100001', fleetJson[0]?.id ?? 'KEM-01'],  // Kranbil
        ['Johan Lindqvist',   '+46701100002', fleetJson[1]?.id ?? 'KEM-02'],  // Lastväxlare
        ['Erik Nordin',       '+46701100003', fleetJson[2]?.id ?? 'KEM-03'],  // Flakbil
        ['Maria Sundberg',    '+46701100004', fleetJson[3]?.id ?? 'KEM-04'],  // Boggi
        ['Lars Karlsson',     '+46701100005', fleetJson[4]?.id ?? 'KEM-05'],  // Truck+Släp
        ['Karin Persson',     '+46701100006', fleetJson[5]?.id ?? 'KEM-06'],  // Containerbil
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
