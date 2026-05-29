import db from '../db.js';

const TED_API = 'https://api.ted.europa.eu/v3/notices/search';

const TRANSPORT_CPVS = [
  '60100000', // Road transport
  '60180000', // Freight transport by road
  '60181000', // Truck hire with driver
  '60182000', // Road vehicle hire with driver
  '63520000', // Transport agency services
  '63521000', // Freight transport agency services
];

const NUTS = {
  'SE11': 'Stockholm',   'SE110': 'Stockholm',
  'SE12': 'Östra Mellansverige', 'SE121': 'Uppsala', 'SE122': 'Södermanland',
  'SE123': 'Östergötland', 'SE124': 'Örebro', 'SE125': 'Västmanland',
  'SE21': 'Småland',     'SE211': 'Jönköping', 'SE212': 'Kronoberg',
  'SE213': 'Kalmar',     'SE214': 'Gotland',
  'SE22': 'Sydsverige',  'SE221': 'Blekinge', 'SE224': 'Skåne',
  'SE23': 'Västsverige', 'SE231': 'Halland',  'SE232': 'Västra Götaland',
  'SE31': 'Norra Mellansverige', 'SE311': 'Värmland', 'SE312': 'Dalarna', 'SE313': 'Gävleborg',
  'SE32': 'Mellersta Norrland',  'SE321': 'Västernorrland', 'SE322': 'Jämtland',
  'SE33': 'Övre Norrland',       'SE331': 'Västerbotten', 'SE332': 'Norrbotten',
};

function nutsToRegion(code) {
  if (!code) return null;
  return NUTS[code] || NUTS[code.slice(0, 4)] || NUTS[code.slice(0, 3)] || code;
}

function parseTEDDate(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const m = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseValue(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

async function fetchTED() {
  const q = `cpv-code IN (${TRANSPORT_CPVS.map(c => `'${c}'`).join(',')}) AND buyer-country-code = 'SE'`;
  const url = new URL(TED_API);
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'ND,TI,AU,DT,PC,CY,TW,VA');
  url.searchParams.set('scope', '0');
  url.searchParams.set('limit', '50');
  url.searchParams.set('onlyLatestVersions', 'true');

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`TED ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return (data.notices || []).map(parseNotice).filter(n => n.external_id && n.titel);
}

function parseNotice(raw) {
  const c = raw.content || raw;
  const get = (k) => { const v = c[k]; return Array.isArray(v) ? v[0] ?? null : (v ?? null); };
  return {
    external_id:          raw.noticePublicationId || get('ND'),
    source:               'TED',
    titel:                get('TI') || get('TI_SV') || get('TI_EN'),
    kopare:               get('AU'),
    nuts_kod:             get('TW'),
    region:               nutsToRegion(get('TW')),
    cpv_koder:            JSON.stringify(c['PC'] || []),
    estimerat_varde_sek:  parseValue(get('VA')),
    valuta:               'SEK',
    deadline:             parseTEDDate(get('DT')),
    publiceringsdatum:    raw.publicationDate || new Date().toISOString().slice(0, 10),
    url:                  `https://ted.europa.eu/en/notice/${raw.noticePublicationId || get('ND')}`,
    raw_data:             JSON.stringify(raw),
  };
}

function mockTenders() {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  return [
    { external_id:'MOCK-001', source:'MOCK', titel:'Godstransporter – Stockholms stad 2026–2029', kopare:'Stockholms stad', nuts_kod:'SE110', region:'Stockholm', cpv_koder:'["60100000","60180000"]', estimerat_varde_sek:4_200_000, valuta:'SEK', deadline:d(18), publiceringsdatum:d(-7), beskrivning:'Transporter för stadens verksamheter. Miljökrav: Euro VI och CO2-redovisning krävs.', url:'https://ted.europa.eu/en/notice/MOCK-001' },
    { external_id:'MOCK-002', source:'MOCK', titel:'Ramavtal godstransporter – Göteborgs Stad', kopare:'Göteborgs Stad', nuts_kod:'SE232', region:'Västra Götaland', cpv_koder:'["60180000","63521000"]', estimerat_varde_sek:8_500_000, valuta:'SEK', deadline:d(34), publiceringsdatum:d(-3), beskrivning:'Tunga godstransporter och kranlyft för Göteborgs infrastrukturprojekt. Anbudsgivare ska uppvisa CO2-rapport för senaste år.', url:'https://ted.europa.eu/en/notice/MOCK-002' },
    { external_id:'MOCK-003', source:'MOCK', titel:'Skolskjuts Malmö Stad 2026', kopare:'Malmö Stad', nuts_kod:'SE224', region:'Skåne', cpv_koder:'["60100000"]', estimerat_varde_sek:2_100_000, valuta:'SEK', deadline:d(8), publiceringsdatum:d(-14), beskrivning:'Skolskjuts för elever i grundskolan. Fordon ska uppfylla Euro VI eller bättre.', url:'https://ted.europa.eu/en/notice/MOCK-003' },
    { external_id:'MOCK-004', source:'MOCK', titel:'Tunga transporter och kranarbeten – Region Uppsala', kopare:'Region Uppsala', nuts_kod:'SE121', region:'Uppsala', cpv_koder:'["60181000","60182000"]', estimerat_varde_sek:3_800_000, valuta:'SEK', deadline:d(45), publiceringsdatum:d(-2), beskrivning:'Kranlyft och tunga godstransporter för regionens byggprojekt 2026–2028. Lastkapacitet >15 ton krävs.', url:'https://ted.europa.eu/en/notice/MOCK-004' },
    { external_id:'MOCK-005', source:'MOCK', titel:'Expresstransporter och kurirtjänster – Linköping', kopare:'Linköpings kommun', nuts_kod:'SE123', region:'Östergötland', cpv_koder:'["60100000","63521000"]', estimerat_varde_sek:950_000, valuta:'SEK', deadline:d(21), publiceringsdatum:d(-5), beskrivning:'Kurirtjänster och snabbtransporter för kommunens förvaltningar. Elfordon eller Euro VI premieras i utvärdering.', url:'https://ted.europa.eu/en/notice/MOCK-005' },
    { external_id:'MOCK-006', source:'MOCK', titel:'Transport av schaktmassor – Västerås Stad', kopare:'Västerås Stad', nuts_kod:'SE125', region:'Västmanland', cpv_koder:'["60180000"]', estimerat_varde_sek:1_600_000, valuta:'SEK', deadline:d(60), publiceringsdatum:d(-1), beskrivning:'Transport av schaktmassor och byggmaterial för kommunens infrastrukturprojekt 2026–2028.', url:'https://ted.europa.eu/en/notice/MOCK-006' },
    { external_id:'MOCK-007', source:'MOCK', titel:'Patienttransporter – Region Örebro', kopare:'Region Örebro', nuts_kod:'SE124', region:'Örebro', cpv_koder:'["60100000"]', estimerat_varde_sek:5_400_000, valuta:'SEK', deadline:d(12), publiceringsdatum:d(-9), beskrivning:'Ramavtal för sjukresor och patienttransporter. Tillgänglighetsanpassade fordon krävs.', url:'https://ted.europa.eu/en/notice/MOCK-007' },
    { external_id:'MOCK-008', source:'MOCK', titel:'Klimatreglerade livsmedelstransporter – ICA Logistik', kopare:'ICA Logistik AB', nuts_kod:'SE11', region:'Stockholm', cpv_koder:'["60180000","60100000"]', estimerat_varde_sek:12_000_000, valuta:'SEK', deadline:d(50), publiceringsdatum:d(-6), beskrivning:'Klimatreglerade transporter av livsmedel till butiker i Stockholmsregionen. CO2-rapportering obligatorisk — minskat utsläpp belönas i poängsättningen.', url:'https://ted.europa.eu/en/notice/MOCK-008' },
    { external_id:'MOCK-009', source:'MOCK', titel:'Avfalls- och återvinningstransporter – Gävle', kopare:'Gävle kommun', nuts_kod:'SE313', region:'Gävleborg', cpv_koder:'["60180000"]', estimerat_varde_sek:2_900_000, valuta:'SEK', deadline:d(38), publiceringsdatum:d(-2), beskrivning:'Hämtning och transport av hushållsavfall, farligt avfall och återvinningsmaterial inom kommunen.', url:'https://ted.europa.eu/en/notice/MOCK-009' },
    { external_id:'MOCK-010', source:'MOCK', titel:'Kontorsflytt och inredningslogistik – Riksbyggen', kopare:'Riksbyggen AB', nuts_kod:'SE121', region:'Uppsala', cpv_koder:'["60100000","60180000"]', estimerat_varde_sek:780_000, valuta:'SEK', deadline:d(28), publiceringsdatum:d(-4), beskrivning:'Flytt av kontorsinredning och IT-utrustning till nytt huvudkontor. Krav på miljöcertifiering och hållbara transporter.', url:'https://ted.europa.eu/en/notice/MOCK-010' },
    { external_id:'MOCK-011', source:'MOCK', titel:'Maskin- och utrustningsfrakt – Trafikverket', kopare:'Trafikverket', nuts_kod:'SE12', region:'Östra Mellansverige', cpv_koder:'["60181000","63520000"]', estimerat_varde_sek:6_700_000, valuta:'SEK', deadline:d(55), publiceringsdatum:d(-1), beskrivning:'Transport av vägunderhållsmaskiner och specialutrustning för vägbyggen i Mellansverige.', url:'https://ted.europa.eu/en/notice/MOCK-011' },
    { external_id:'MOCK-012', source:'MOCK', titel:'Budbilstjänster – Region Stockholm', kopare:'Region Stockholm', nuts_kod:'SE110', region:'Stockholm', cpv_koder:'["60100000"]', estimerat_varde_sek:1_200_000, valuta:'SEK', deadline:d(15), publiceringsdatum:d(-8), beskrivning:'Budbilstjänster för transport av prover och material mellan sjukhus och laboratorier. CO2-neutrala transporter meriterande.', url:'https://ted.europa.eu/en/notice/MOCK-012' },
  ];
}

// ── Scoring & fleet assessment ──────────────────────────────────────────────

function hasCO2Data(companyId) {
  try {
    const r = db.prepare(`
      SELECT COUNT(*) AS n FROM quotes
      WHERE company_id = ? AND avstand_km > 0 AND avstand_km IS NOT NULL
    `).get(companyId);
    return (r?.n ?? 0) > 0;
  } catch { return false; }
}

function scoreTender(tender, fleet, hasCO2) {
  let score = 45;

  const beskr = ((tender.beskrivning || '') + ' ' + (tender.titel || '')).toLowerCase();

  // CO2 advantage
  if (hasCO2 && /co2|utsläpp|emission|klimat|miljö|hållbar/i.test(beskr)) score += 18;
  else if (hasCO2) score += 5;

  // Value attractiveness
  const v = tender.estimerat_varde_sek || 0;
  if (v >= 5_000_000) score += 12;
  else if (v >= 1_000_000) score += 8;
  else if (v >= 300_000) score += 4;

  // Deadline — enough time?
  if (tender.deadline) {
    const days = Math.ceil((new Date(tender.deadline) - new Date()) / 86_400_000);
    if (days >= 21) score += 10;
    else if (days >= 10) score += 5;
    else if (days < 4) score -= 12;
  }

  const maxKg  = fleet.reduce((m, v) => Math.max(m, v.max_last_kg || 0), 0);
  const maxEuro = fleet.reduce((m, v) => Math.max(m, Number(v.euro_klass) || 0), 0);
  const hasCrane = fleet.some(v => /kran/i.test(v.typ || ''));

  if (/kran|lyft/i.test(beskr) && hasCrane) score += 10;
  if (/kran|lyft/i.test(beskr) && !hasCrane) score -= 18;
  if (/euro vi|euro 6/i.test(beskr) && maxEuro >= 6) score += 8;
  if (/euro vi|euro 6/i.test(beskr) && maxEuro < 6) score -= 12;
  if (maxKg >= 20_000) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function assessFleet(tender, fleet) {
  const beskr = ((tender.beskrivning || '') + ' ' + (tender.titel || '')).toLowerCase();
  const maxKg   = fleet.reduce((m, v) => Math.max(m, v.max_last_kg || 0), 0);
  const maxEuro = fleet.reduce((m, v) => Math.max(m, Number(v.euro_klass) || 0), 0);
  const hasCrane = fleet.some(v => /kran/i.test(v.typ || ''));

  const issues = [];
  if (/kran|lyft/i.test(beskr) && !hasCrane) issues.push('Kräver kranfordon');
  if (/euro vi|euro 6/i.test(beskr) && maxEuro < 6) issues.push('Euro VI krävs');
  if (/>40\s*ton|40\s*t\b/i.test(beskr) && maxKg < 40_000) issues.push('Kapacitet >40 t krävs');

  return { kan_hantera: issues.length === 0, orsak: issues.join(', ') || null };
}

// ── DB write ─────────────────────────────────────────────────────────────────

const upsert = db.prepare(`
  INSERT INTO upphandlingar (
    company_id, external_id, source, titel, kopare, nuts_kod, region,
    cpv_koder, estimerat_varde_sek, valuta, deadline, publiceringsdatum,
    beskrivning, url, relevans_score, flotta_kan_hantera, flotta_orsak, co2_fordel
  ) VALUES (
    @company_id, @external_id, @source, @titel, @kopare, @nuts_kod, @region,
    @cpv_koder, @estimerat_varde_sek, @valuta, @deadline, @publiceringsdatum,
    @beskrivning, @url, @relevans_score, @flotta_kan_hantera, @flotta_orsak, @co2_fordel
  )
  ON CONFLICT(company_id, external_id) DO UPDATE SET
    titel               = excluded.titel,
    kopare              = excluded.kopare,
    deadline            = excluded.deadline,
    estimerat_varde_sek = excluded.estimerat_varde_sek,
    beskrivning         = excluded.beskrivning,
    relevans_score      = excluded.relevans_score,
    flotta_kan_hantera  = excluded.flotta_kan_hantera,
    flotta_orsak        = excluded.flotta_orsak,
    co2_fordel          = excluded.co2_fordel,
    hamtad_at           = CURRENT_TIMESTAMP
    WHERE upphandlingar.dismissed = 0
`);

const getFleet     = db.prepare('SELECT * FROM company_fleet WHERE company_id = ?');
const getCompanies = db.prepare('SELECT id FROM companies WHERE active = 1');

// ── Main job ─────────────────────────────────────────────────────────────────

export async function runTenderFetchJob() {
  console.log('[tenders] Starting fetch');

  let notices;
  try {
    notices = await fetchTED();
    if (!notices.length) throw new Error('empty response');
    console.log(`[tenders] TED: ${notices.length} notices`);
  } catch (err) {
    console.warn('[tenders] TED API unavailable, using mock data:', err.message);
    notices = mockTenders();
  }

  const companies = getCompanies.all();
  let saved = 0;

  for (const company of companies) {
    const fleet  = getFleet.all(company.id);
    const hasCO2 = hasCO2Data(company.id);

    for (const notice of notices) {
      const score = scoreTender(notice, fleet, hasCO2);
      const { kan_hantera, orsak } = assessFleet(notice, fleet);
      const beskr = ((notice.beskrivning || '') + ' ' + (notice.titel || '')).toLowerCase();
      const co2_fordel = hasCO2 && /co2|utsläpp|emission|klimat|miljö|hållbar/i.test(beskr) ? 1 : 0;

      try {
        upsert.run({
          company_id:          company.id,
          external_id:         notice.external_id,
          source:              notice.source || 'TED',
          titel:               notice.titel || 'Upphandling',
          kopare:              notice.kopare ?? null,
          nuts_kod:            notice.nuts_kod ?? null,
          region:              notice.region ?? null,
          cpv_koder:           notice.cpv_koder || '[]',
          estimerat_varde_sek: notice.estimerat_varde_sek ?? null,
          valuta:              'SEK',
          deadline:            notice.deadline ?? null,
          publiceringsdatum:   notice.publiceringsdatum ?? new Date().toISOString().slice(0, 10),
          beskrivning:         notice.beskrivning ?? null,
          url:                 notice.url ?? null,
          relevans_score:      score,
          flotta_kan_hantera:  kan_hantera ? 1 : 0,
          flotta_orsak:        orsak,
          co2_fordel,
        });
        saved++;
      } catch (e) {
        if (!e.message.includes('UNIQUE')) console.warn(`[tenders] upsert ${notice.external_id}:`, e.message);
      }
    }
  }

  console.log(`[tenders] Done — ${saved} rows for ${companies.length} companies`);
}

export function scheduleTenderFetch() {
  setTimeout(runTenderFetchJob, 6_000);
  setInterval(runTenderFetchJob, 24 * 60 * 60 * 1_000);
}
