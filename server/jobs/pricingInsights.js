import db from '../db.js';

// Stockholm zone classifier — matches addresses to geographic corridors
const ZONES = {
  centrum:   ['gamla stan', 'norrmalm', 'södermalm', 'vasastan', 'kungsholmen', 'östermalm',
               'stockholm c', 'centralen', 't-centralen', 'city', 'sthlm c', 'riddarholmen'],
  norr:      ['solna', 'sundbyberg', 'danderyd', 'täby', 'sollentuna', 'vallentuna',
               'upplands väsby', 'upplands-väsby', 'märsta', 'sigtuna', 'arlanda', 'rotebro'],
  söder:     ['huddinge', 'botkyrka', 'haninge', 'nynäshamn', 'salem', 'södertälje', 'tyresö',
               'flemingsberg', 'tumba', 'jordbro'],
  väster:    ['järfälla', 'upplands-bro', 'ekerö', 'håbo', 'kungsängen', 'barkarby', 'jakobsberg'],
  öster:     ['lidingö', 'värmdö', 'nacka', 'gustavsberg', 'saltsjöbaden', 'djursholm'],
  norrtälje: ['norrtälje', 'rimbo', 'hallstavik'],
};

function classifyZone(address) {
  if (!address) return 'övrigt';
  const lower = address.toLowerCase();
  for (const [zone, keywords] of Object.entries(ZONES)) {
    if (keywords.some((k) => lower.includes(k))) return zone;
  }
  return 'övrigt';
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeMarginPct(row) {
  if (!row.totalpris_sek) return null;
  const cost = (row['bränsle_kostnad'] ?? 0) + (row['arbetstid_kostnad'] ?? 0);
  return ((row.totalpris_sek - cost) / row.totalpris_sek) * 100;
}

function upsertInsight(companyId, type, data, confidence) {
  db.prepare(`
    INSERT INTO pricing_insights (company_id, insight_type, insight_data, confidence, created_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(company_id, insight_type) DO UPDATE SET
      insight_data = excluded.insight_data,
      confidence   = excluded.confidence,
      created_at   = excluded.created_at
  `).run(companyId, type, JSON.stringify(data), confidence);
}

export function computeInsightsForCompany(companyId) {
  const { n: acceptedCount } = db.prepare(
    `SELECT COUNT(*) AS n FROM quotes WHERE company_id = ? AND status = 'godkänd'`
  ).get(companyId);

  // Always write status — used by frontend to show unlock progress
  upsertInsight(companyId, 'status', {
    unlocked:      acceptedCount >= 30,
    accepted_count: acceptedCount,
    threshold:     30,
  }, 1.0);

  if (acceptedCount < 30) return;

  const accepted = db.prepare(
    `SELECT * FROM quotes WHERE company_id = ? AND status = 'godkänd' AND totalpris_sek IS NOT NULL`
  ).all(companyId);

  // ── 1. Average margin by cargo type ─────────────────────────────────────────
  const ctMap = {};
  for (const q of accepted) {
    if (!q.lasttyp) continue;
    if (!ctMap[q.lasttyp]) ctMap[q.lasttyp] = { prices: [], margins: [], distances: [] };
    ctMap[q.lasttyp].prices.push(q.totalpris_sek);
    const m = computeMarginPct(q);
    if (m != null) ctMap[q.lasttyp].margins.push(m);
    if (q.avstand_km) ctMap[q.lasttyp].distances.push(q.avstand_km);
  }
  const cargoItems = Object.entries(ctMap).map(([lasttyp, d]) => ({
    lasttyp,
    avg_price:      avg(d.prices),
    avg_margin_pct: avg(d.margins),
    avg_distance:   avg(d.distances),
    n:              d.prices.length,
  }));
  upsertInsight(companyId, 'cargo_type_margin', { items: cargoItems }, 0.9);

  // Build avg-by-type map for tier computation below
  const avgByType = {};
  for (const ci of cargoItems) avgByType[ci.lasttyp] = ci.avg_price;

  // ── 2. Average margin by customer ────────────────────────────────────────────
  const custRows = db.prepare(
    `SELECT j.customer_id, c.name AS customer_name,
            q.totalpris_sek, q.bränsle_kostnad, q.arbetstid_kostnad
     FROM quotes q
     LEFT JOIN jobs j ON j.quote_id = q.id
     LEFT JOIN customers c ON c.id = j.customer_id AND c.company_id = q.company_id
     WHERE q.company_id = ? AND q.status = 'godkänd'
       AND q.totalpris_sek IS NOT NULL AND j.customer_id IS NOT NULL`
  ).all(companyId);

  const custMap = {};
  for (const r of custRows) {
    if (!custMap[r.customer_id]) custMap[r.customer_id] = { name: r.customer_name, prices: [], margins: [] };
    custMap[r.customer_id].prices.push(r.totalpris_sek);
    const m = computeMarginPct(r);
    if (m != null) custMap[r.customer_id].margins.push(m);
  }
  const custItems = Object.entries(custMap)
    .filter(([, d]) => d.prices.length >= 2)
    .map(([cid, d]) => ({
      customer_id:    Number(cid),
      customer_name:  d.name ?? `Kund #${cid}`,
      avg_price:      avg(d.prices),
      avg_margin_pct: avg(d.margins),
      n:              d.prices.length,
    }))
    .sort((a, b) => b.n - a.n);
  upsertInsight(companyId, 'customer_margin', { items: custItems }, 0.85);

  // ── 3. Average margin by route corridor ──────────────────────────────────────
  const corrMap = {};
  for (const q of accepted) {
    const key = `${classifyZone(q['upphämtning'])} → ${classifyZone(q.leverans)}`;
    if (!corrMap[key]) corrMap[key] = { prices: [], margins: [] };
    corrMap[key].prices.push(q.totalpris_sek);
    const m = computeMarginPct(q);
    if (m != null) corrMap[key].margins.push(m);
  }
  const corrItems = Object.entries(corrMap)
    .filter(([, d]) => d.prices.length >= 2)
    .map(([corridor, d]) => ({
      corridor,
      avg_price:      avg(d.prices),
      avg_margin_pct: avg(d.margins),
      n:              d.prices.length,
    }))
    .sort((a, b) => b.n - a.n);
  upsertInsight(companyId, 'corridor_margin', { items: corrItems }, 0.8);

  // ── 4. Quote acceptance rate by price tier ───────────────────────────────────
  // Compares each quote's price against that company's own historical avg for the same cargo type.
  // Tiers: below (<-10% of avg), at (±10%), above (>+10%)
  const allQuotes = db.prepare(
    `SELECT lasttyp, totalpris_sek, status FROM quotes
     WHERE company_id = ? AND totalpris_sek IS NOT NULL AND lasttyp IS NOT NULL`
  ).all(companyId);

  const tierMap = {};
  for (const q of allQuotes) {
    const refAvg = avgByType[q.lasttyp];
    if (!refAvg) continue;
    const pct  = (q.totalpris_sek - refAvg) / refAvg;
    const tier = pct < -0.10 ? 'below' : pct > 0.10 ? 'above' : 'at';
    if (!tierMap[q.lasttyp]) tierMap[q.lasttyp] = { below: [], at: [], above: [] };
    tierMap[q.lasttyp][tier].push(q.status === 'godkänd' ? 1 : 0);
  }

  const tierData = {};
  for (const [lasttyp, tiers] of Object.entries(tierMap)) {
    tierData[lasttyp] = { avg_accepted_price: avgByType[lasttyp] };
    for (const tier of ['below', 'at', 'above']) {
      const arr = tiers[tier];
      tierData[lasttyp][tier] = {
        n:               arr.length,
        accepted:        arr.filter(Boolean).length,
        acceptance_rate: arr.length ? arr.filter(Boolean).length / arr.length : 0,
      };
    }
  }
  upsertInsight(companyId, 'price_tier_acceptance', { by_cargo_type: tierData }, 0.8);

  // ── 5. Time-of-week patterns ─────────────────────────────────────────────────
  const DOW_LABELS = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  const allTow = db.prepare(
    `SELECT CAST(strftime('%w', created_at) AS INTEGER) AS dow, status, totalpris_sek
     FROM quotes WHERE company_id = ?`
  ).all(companyId);

  const towMap = {};
  for (const q of allTow) {
    if (!towMap[q.dow]) towMap[q.dow] = { total: 0, accepted: 0, prices: [] };
    towMap[q.dow].total++;
    if (q.status === 'godkänd') {
      towMap[q.dow].accepted++;
      if (q.totalpris_sek) towMap[q.dow].prices.push(q.totalpris_sek);
    }
  }
  const towItems = Object.entries(towMap)
    .map(([d, v]) => ({
      dow:                Number(d),
      label:              DOW_LABELS[Number(d)],
      total:              v.total,
      accepted:           v.accepted,
      acceptance_rate:    v.total ? v.accepted / v.total : 0,
      avg_accepted_price: avg(v.prices),
    }))
    .sort((a, b) => a.dow - b.dow);
  upsertInsight(companyId, 'time_of_week', { items: towItems }, 0.75);

  // ── 6. Seasonal pricing curves ───────────────────────────────────────────────
  const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  const allSeason = db.prepare(
    `SELECT CAST(strftime('%m', created_at) AS INTEGER) AS month,
            status, totalpris_sek, bränsle_kostnad, arbetstid_kostnad
     FROM quotes WHERE company_id = ?`
  ).all(companyId);

  const seasonMap = {};
  for (const q of allSeason) {
    if (!seasonMap[q.month]) seasonMap[q.month] = { total: 0, accepted: 0, prices: [], margins: [] };
    seasonMap[q.month].total++;
    if (q.status === 'godkänd' && q.totalpris_sek) {
      seasonMap[q.month].accepted++;
      seasonMap[q.month].prices.push(q.totalpris_sek);
      const m = computeMarginPct(q);
      if (m != null) seasonMap[q.month].margins.push(m);
    }
  }
  const seasonItems = Object.entries(seasonMap)
    .map(([mo, v]) => ({
      month:              Number(mo),
      label:              MONTH_LABELS[Number(mo)],
      total:              v.total,
      accepted:           v.accepted,
      acceptance_rate:    v.total ? v.accepted / v.total : 0,
      avg_accepted_price: avg(v.prices),
      avg_margin_pct:     avg(v.margins),
    }))
    .sort((a, b) => a.month - b.month);
  upsertInsight(companyId, 'seasonal_curve', { items: seasonItems }, 0.75);
}

export function runPricingInsightsJob() {
  const companies = db.prepare('SELECT id FROM companies').all();
  let ok = 0;
  for (const { id } of companies) {
    try {
      computeInsightsForCompany(id);
      ok++;
    } catch (err) {
      console.error(`[pricing-insights] Failed for company ${id}:`, err.message);
    }
  }
  console.log(`[pricing-insights] Computed for ${ok}/${companies.length} companies — ${new Date().toISOString()}`);
}
