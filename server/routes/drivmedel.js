import { Router }  from 'express';
import multer       from 'multer';
import * as XLSX    from 'xlsx';
import db           from '../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── CSV / Excel parsing helpers ───────────────────────────────────────────────

function stripBom(str) {
  return str.startsWith('﻿') ? str.slice(1) : str;
}

function detectDelimiter(headerLine) {
  const semis  = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semis >= commas ? ';' : ',';
}

function parseSwedishNumber(s) {
  if (s == null) return null;
  const str = String(s).trim().replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Excel serial number
  if (/^\d{5}$/.test(str)) {
    const d = XLSX.SSF.parse_date_code(parseInt(str, 10));
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  return null;
}

// Column name → normalised key mapping (lowercased, trimmed)
const COL_MAP = {
  // date
  datum: 'date', date: 'date', transaktionsdatum: 'date', transdatum: 'date',
  'transaction date': 'date', transdate: 'date',
  // card
  kortnummer: 'card', 'card number': 'card', kortnr: 'card', kortnr_: 'card',
  kort: 'card', cardnumber: 'card', cardno: 'card',
  // reg
  registreringsnummer: 'reg', regnr: 'reg', 'reg.nr': 'reg', reg: 'reg',
  registration: 'reg', fordon: 'reg', vehicle: 'reg', 'reg nr': 'reg',
  // litres
  'mängd': 'litres', volym: 'litres', liter: 'litres', volume: 'litres',
  'quantity': 'litres', antal: 'litres', 'qty': 'litres', liter_: 'litres',
  // amount
  belopp: 'amount', amount: 'amount', totalt: 'amount', total: 'amount',
  'summa': 'amount', cost: 'amount', kostnad: 'amount', totalbelopp: 'amount',
  // price per litre
  pris: 'ppl', 'pris/l': 'ppl', 'price': 'ppl', enhetspris: 'ppl',
  'á-pris': 'ppl', apris: 'ppl',
  // station
  station: 'station', bensinstation: 'station', mack: 'station', site: 'station',
  plats: 'station', anläggning: 'station', tankstation: 'station',
  // fuel type
  produkt: 'fuel', product: 'fuel', typ: 'fuel', fuel: 'fuel', bränsle: 'fuel',
};

function normaliseHeader(h) {
  return String(h).toLowerCase().trim()
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o')
    .replace(/[^\w\s\/\.\-]/g, '').trim();
}

function mapColumns(headers) {
  return headers.map((h) => {
    const norm = normaliseHeader(h);
    return COL_MAP[norm] ?? COL_MAP[norm.replace(/\s+/g, '')] ?? null;
  });
}

function parseRows(rawRows, headers) {
  const colMap = mapColumns(headers);
  const results = [];

  for (const row of rawRows) {
    const get = (key) => {
      const idx = colMap.indexOf(key);
      return idx >= 0 ? row[idx] : null;
    };

    const date  = parseDate(get('date'));
    if (!date) continue;

    const litres = parseSwedishNumber(get('litres'));
    const amount = parseSwedishNumber(get('amount'));
    const ppl    = parseSwedishNumber(get('ppl')) ?? (litres && amount && litres > 0 ? Math.round(amount / litres * 100) / 100 : null);

    results.push({
      card_number:     String(get('card') ?? '').trim() || null,
      reg:             String(get('reg')  ?? '').trim().toUpperCase().replace(/\s/g, '') || null,
      transaction_date: date,
      station_name:    String(get('station') ?? '').trim() || null,
      fuel_type:       String(get('fuel') ?? '').trim() || null,
      litres:          litres,
      amount_sek:      amount,
      price_per_litre: ppl,
    });
  }
  return results;
}

function detectProvider(headerLine) {
  const l = headerLine.toLowerCase();
  if (l.includes('circle k') || l.includes('circlek')) return 'circle_k';
  if (l.includes('preem'))                                return 'preem';
  if (l.includes('okq8') || l.includes('ok q8'))         return 'okq8';
  if (l.includes('tanka'))                                return 'tanka';
  // Guess from column patterns
  if (l.includes('mángd') || l.includes('mängd'))        return 'circle_k';
  if (l.includes('bensinstation'))                        return 'preem';
  return 'unknown';
}

function parseCsv(buffer) {
  const text    = stripBom(buffer.toString('utf8'));
  const lines   = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { provider: 'unknown', rows: [] };

  const delim    = detectDelimiter(lines[0]);
  const provider = detectProvider(lines[0]);
  const headers  = lines[0].split(delim).map((h) => h.replace(/^"|"$/g, '').trim());

  const rawRows = lines.slice(1).map((l) =>
    l.split(delim).map((c) => c.replace(/^"|"$/g, '').trim()),
  );

  return { provider, rows: parseRows(rawRows, headers) };
}

function parseExcel(buffer) {
  const wb     = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const ws     = wb.Sheets[wb.SheetNames[0]];
  const arr    = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (arr.length < 2) return { provider: 'unknown', rows: [] };

  const headers   = arr[0].map(String);
  const provider  = detectProvider(headers.join(',').toLowerCase());
  const rawRows   = arr.slice(1).filter((r) => r.some((c) => c !== ''));

  return { provider, rows: parseRows(rawRows, headers) };
}

// ── Match parsed rows to vehicles ────────────────────────────────────────────

function matchVehicle(companyId, parsed) {
  const fleet = db.prepare('SELECT * FROM company_fleet WHERE company_id = ?').all(companyId);
  const cards = db.prepare('SELECT * FROM fuel_cards WHERE company_id = ? AND aktiv = 1').all(companyId);

  return parsed.map((row) => {
    let vehicle_id = null;

    // 1. Match by card number
    if (row.card_number) {
      const card = cards.find((c) => c.card_number === row.card_number);
      if (card) vehicle_id = card.vehicle_id;
    }

    // 2. Fall back: match by registration plate
    if (!vehicle_id && row.reg) {
      const veh = fleet.find((v) =>
        v.reg && v.reg.replace(/\s/g, '').toUpperCase() === row.reg,
      );
      if (veh) vehicle_id = veh.id;
    }

    return { ...row, vehicle_id };
  });
}

// ── Fuel card mappings ────────────────────────────────────────────────────────

router.get('/cards', (req, res) => {
  const rows = db.prepare(`
    SELECT fc.*, cf.ext_id AS vehicle_ext_id, cf.namn AS vehicle_namn, cf.reg AS vehicle_reg
    FROM fuel_cards fc
    LEFT JOIN company_fleet cf ON cf.id = fc.vehicle_id
    WHERE fc.company_id = ? AND fc.aktiv = 1
    ORDER BY fc.card_number
  `).all(req.companyId);
  res.json(rows);
});

router.post('/cards', (req, res) => {
  const { card_number, vehicle_id, provider, holder_name } = req.body ?? {};
  if (!card_number?.trim()) return res.status(400).json({ error: 'card_number required' });

  try {
    const r = db.prepare(`
      INSERT INTO fuel_cards (company_id, card_number, vehicle_id, provider, holder_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.companyId, card_number.trim(), vehicle_id ?? null, provider ?? null, holder_name ?? null);
    res.status(201).json(db.prepare('SELECT * FROM fuel_cards WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Card already registered' });
    throw err;
  }
});

router.put('/cards/:id', (req, res) => {
  const { vehicle_id, provider, holder_name, aktiv } = req.body ?? {};
  const card = db.prepare('SELECT id FROM fuel_cards WHERE id = ? AND company_id = ?').get(req.params.id, req.companyId);
  if (!card) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE fuel_cards
    SET vehicle_id  = COALESCE(?, vehicle_id),
        provider    = COALESCE(?, provider),
        holder_name = COALESCE(?, holder_name),
        aktiv       = COALESCE(?, aktiv)
    WHERE id = ? AND company_id = ?
  `).run(vehicle_id ?? null, provider ?? null, holder_name ?? null, aktiv ?? null, req.params.id, req.companyId);

  res.json(db.prepare(`
    SELECT fc.*, cf.ext_id AS vehicle_ext_id, cf.namn AS vehicle_namn, cf.reg AS vehicle_reg
    FROM fuel_cards fc LEFT JOIN company_fleet cf ON cf.id = fc.vehicle_id
    WHERE fc.id = ?
  `).get(req.params.id));
});

router.delete('/cards/:id', (req, res) => {
  db.prepare('UPDATE fuel_cards SET aktiv = 0 WHERE id = ? AND company_id = ?').run(req.params.id, req.companyId);
  res.json({ ok: true });
});

// ── Import ────────────────────────────────────────────────────────────────────

router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { originalname, buffer, mimetype } = req.file;
  const isExcel = /\.(xlsx|xls|xlsm)$/i.test(originalname) ||
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  let parsed;
  try {
    parsed = isExcel ? parseExcel(buffer) : parseCsv(buffer);
  } catch (err) {
    return res.status(422).json({ error: 'Could not parse file: ' + err.message });
  }

  if (parsed.rows.length === 0) {
    return res.status(422).json({ error: 'No valid transactions found in file. Check format.' });
  }

  const withVehicles = matchVehicle(req.companyId, parsed.rows);
  const matchedCount  = withVehicles.filter((r) => r.vehicle_id).length;

  // Save import record
  const imp = db.prepare(`
    INSERT INTO fuel_imports (company_id, filename, provider, row_count, matched_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.companyId, originalname, parsed.provider, parsed.rows.length, matchedCount);

  const importId = imp.lastInsertRowid;

  // Save transactions (skip duplicates: same company, card, date, amount)
  const ins = db.prepare(`
    INSERT OR IGNORE INTO fuel_transactions
      (company_id, import_id, card_number, vehicle_id, transaction_date, station_name,
       fuel_type, litres, amount_sek, price_per_litre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let saved = 0;
  db.exec('BEGIN');
  try {
    for (const row of withVehicles) {
      const r = ins.run(
        req.companyId, importId, row.card_number, row.vehicle_id,
        row.transaction_date, row.station_name, row.fuel_type,
        row.litres, row.amount_sek, row.price_per_litre,
      );
      if (r.changes) saved++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }

  res.json({
    import_id:     importId,
    provider:      parsed.provider,
    parsed:        parsed.rows.length,
    saved,
    matched:       matchedCount,
    unmatched:     parsed.rows.length - matchedCount,
    skipped:       parsed.rows.length - saved,
  });
});

// ── Imports list ──────────────────────────────────────────────────────────────

router.get('/imports', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM fuel_imports WHERE company_id = ? ORDER BY imported_at DESC LIMIT 50
  `).all(req.companyId);
  res.json(rows);
});

// ── Transactions ──────────────────────────────────────────────────────────────

router.get('/transactions', (req, res) => {
  const { vehicle_id, from, to, unreconciled } = req.query;
  let where = 't.company_id = ?';
  const params = [req.companyId];

  if (vehicle_id)    { where += ' AND t.vehicle_id = ?';         params.push(vehicle_id); }
  if (from)          { where += ' AND t.transaction_date >= ?';   params.push(from); }
  if (to)            { where += ' AND t.transaction_date <= ?';   params.push(to); }
  if (unreconciled)  { where += ' AND t.job_id IS NULL'; }

  const rows = db.prepare(`
    SELECT t.*,
           cf.ext_id AS vehicle_ext_id, cf.namn AS vehicle_namn, cf.reg AS vehicle_reg,
           q.upphämtning, q.leverans, q.datum AS job_datum
    FROM fuel_transactions t
    LEFT JOIN company_fleet cf ON cf.id = t.vehicle_id
    LEFT JOIN jobs j ON j.id = t.job_id
    LEFT JOIN quotes q ON q.id = j.quote_id
    WHERE ${where}
    ORDER BY t.transaction_date DESC, t.id DESC
    LIMIT 500
  `).all(...params);

  res.json(rows);
});

// ── Reconcile: match transactions → jobs, update actual_bränsle_sek ──────────

router.post('/reconcile', (req, res) => {
  const unmatched = db.prepare(`
    SELECT t.*, cf.ext_id AS veh_ext_id
    FROM fuel_transactions t
    JOIN company_fleet cf ON cf.id = t.vehicle_id
    WHERE t.company_id = ? AND t.job_id IS NULL AND t.vehicle_id IS NOT NULL
  `).all(req.companyId);

  let linked = 0;
  const updateTx  = db.prepare('UPDATE fuel_transactions SET job_id = ?, reconciled_at = datetime(\'now\') WHERE id = ?');
  const updateJob = db.prepare('UPDATE quotes SET actual_bränsle_sek = COALESCE(actual_bränsle_sek, 0) + ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    for (const tx of unmatched) {
      // Find jobs for this vehicle within ±1 day of the transaction
      const jobs = db.prepare(`
        SELECT j.id, q.id AS quote_id, q.datum, q.avstand_km
        FROM jobs j
        JOIN quotes q ON q.id = j.quote_id AND q.company_id = j.company_id
        WHERE j.company_id = ?
          AND q.fordon_id = ?
          AND date(q.datum, '-1 day') <= ? AND date(q.datum, '+1 day') >= ?
        ORDER BY ABS(julianday(q.datum) - julianday(?)) ASC
        LIMIT 1
      `).all(req.companyId, tx.veh_ext_id, tx.transaction_date, tx.transaction_date, tx.transaction_date);

      if (jobs.length > 0) {
        const job = jobs[0];
        updateTx.run(job.id, tx.id);
        if (tx.amount_sek && job.quote_id) {
          updateJob.run(tx.amount_sek, job.quote_id);
        }
        linked++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }

  res.json({ reconciled: linked, total_unmatched: unmatched.length, skipped: unmatched.length - linked });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

router.get('/analytics', (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const dateTo   = to   || new Date().toISOString().slice(0, 10);

  // Per-vehicle fuel stats
  const vehicleStats = db.prepare(`
    SELECT
      cf.id, cf.ext_id, cf.namn, cf.typ, cf.reg,
      cf.forbrukning_l_per_km AS expected_l_per_km,
      COUNT(ft.id)            AS tx_count,
      COALESCE(SUM(ft.litres), 0)      AS total_litres,
      COALESCE(SUM(ft.amount_sek), 0)  AS total_sek,
      COALESCE(AVG(ft.price_per_litre), 0) AS avg_ppl,
      COUNT(CASE WHEN ft.job_id IS NOT NULL THEN 1 END) AS reconciled_count
    FROM company_fleet cf
    LEFT JOIN fuel_transactions ft
      ON ft.vehicle_id = cf.id
      AND ft.company_id = cf.company_id
      AND ft.transaction_date BETWEEN ? AND ?
    WHERE cf.company_id = ?
    GROUP BY cf.id
    HAVING tx_count > 0
    ORDER BY total_sek DESC
  `).all(dateFrom, dateTo, req.companyId);

  // Get km from reconciled jobs per vehicle
  const kmByVehicle = db.prepare(`
    SELECT q.fordon_id, SUM(q.avstand_km) AS total_km
    FROM fuel_transactions ft
    JOIN jobs j ON j.id = ft.job_id
    JOIN quotes q ON q.id = j.quote_id AND q.company_id = j.company_id
    WHERE ft.company_id = ?
      AND ft.transaction_date BETWEEN ? AND ?
      AND ft.vehicle_id IS NOT NULL
    GROUP BY q.fordon_id
  `).all(req.companyId, dateFrom, dateTo);

  const kmMap = {};
  for (const r of kmByVehicle) kmMap[r.fordon_id] = r.total_km;

  // Enrich with l/km and anomaly flag
  const ANOMALY_THRESHOLD = 1.35;
  let fleetTotalLitres = 0, fleetTotalKm = 0;

  const enriched = vehicleStats.map((v) => {
    const km       = kmMap[v.ext_id] ?? 0;
    const l_per_km = km > 0 ? Math.round(v.total_litres / km * 1000) / 1000 : null;
    fleetTotalLitres += v.total_litres;
    fleetTotalKm     += km;
    return { ...v, total_km: km, l_per_km };
  });

  const fleetAvg = fleetTotalKm > 0
    ? Math.round(fleetTotalLitres / fleetTotalKm * 1000) / 1000
    : null;

  const withFlags = enriched.map((v) => ({
    ...v,
    fleet_avg_l_per_km: fleetAvg,
    anomaly: fleetAvg && v.l_per_km
      ? v.l_per_km > fleetAvg * ANOMALY_THRESHOLD
      : false,
    anomaly_pct: fleetAvg && v.l_per_km
      ? Math.round((v.l_per_km / fleetAvg - 1) * 100)
      : null,
  }));

  // Monthly spend trend
  const monthlyTrend = db.prepare(`
    SELECT strftime('%Y-%m', transaction_date) AS month,
           SUM(litres) AS litres, SUM(amount_sek) AS amount_sek,
           COUNT(*) AS tx_count
    FROM fuel_transactions
    WHERE company_id = ? AND transaction_date BETWEEN ? AND ?
    GROUP BY month ORDER BY month ASC
  `).all(req.companyId, dateFrom, dateTo);

  // Station spend (top 10)
  const topStations = db.prepare(`
    SELECT station_name, SUM(amount_sek) AS total_sek, COUNT(*) AS tx_count, SUM(litres) AS litres
    FROM fuel_transactions
    WHERE company_id = ? AND transaction_date BETWEEN ? AND ?
      AND station_name IS NOT NULL AND station_name != ''
    GROUP BY station_name
    ORDER BY total_sek DESC LIMIT 10
  `).all(req.companyId, dateFrom, dateTo);

  // Unmatched card numbers (no mapping)
  const unmapped = db.prepare(`
    SELECT card_number, COUNT(*) AS tx_count, SUM(amount_sek) AS total_sek
    FROM fuel_transactions
    WHERE company_id = ? AND vehicle_id IS NULL AND card_number IS NOT NULL
      AND transaction_date BETWEEN ? AND ?
    GROUP BY card_number
    ORDER BY total_sek DESC
  `).all(req.companyId, dateFrom, dateTo);

  res.json({
    date_from:       dateFrom,
    date_to:         dateTo,
    vehicles:        withFlags,
    fleet_avg_l_per_km: fleetAvg,
    monthly_trend:   monthlyTrend,
    top_stations:    topStations,
    unmapped_cards:  unmapped,
    anomaly_count:   withFlags.filter((v) => v.anomaly).length,
  });
});

// ── Stats (KPI header) ────────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const from  = `${month}-01`;
  const to    = `${month}-31`;

  const totals = db.prepare(`
    SELECT COALESCE(SUM(amount_sek),0) AS total_sek,
           COALESCE(SUM(litres), 0)    AS total_litres,
           COUNT(*)                    AS tx_count,
           COUNT(DISTINCT vehicle_id)  AS vehicle_count,
           COUNT(CASE WHEN job_id IS NOT NULL THEN 1 END) AS reconciled
    FROM fuel_transactions
    WHERE company_id = ? AND transaction_date BETWEEN ? AND ?
  `).get(req.companyId, from, to);

  const cards       = db.prepare('SELECT COUNT(*) AS n FROM fuel_cards WHERE company_id = ? AND aktiv = 1').get(req.companyId).n;
  const anomalies   = db.prepare(`
    SELECT COUNT(DISTINCT t.vehicle_id) AS n
    FROM fuel_transactions t
    JOIN (
      SELECT vehicle_id, SUM(litres) AS vl
      FROM fuel_transactions WHERE company_id = ? GROUP BY vehicle_id
    ) v ON v.vehicle_id = t.vehicle_id
    JOIN (
      SELECT AVG(litres) AS avg_l FROM fuel_transactions WHERE company_id = ?
    ) a
    WHERE t.company_id = ? AND v.vl > a.avg_l * 1.35
  `).get(req.companyId, req.companyId, req.companyId).n;

  res.json({
    this_month_sek:    Math.round(totals.total_sek),
    this_month_litres: Math.round(totals.total_litres * 10) / 10,
    tx_count:          totals.tx_count,
    vehicle_count:     totals.vehicle_count,
    reconciled:        totals.reconciled,
    unreconciled:      totals.tx_count - totals.reconciled,
    registered_cards:  cards,
    anomaly_vehicles:  anomalies,
  });
});

export default router;
