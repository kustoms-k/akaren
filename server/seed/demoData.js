/**
 * Demo data seed for Åkaren TMS.
 * Generates a full 6-month operating history for a demo åkeri so every page
 * in the app shows realistic, populated data during customer demos.
 *
 * Uses better-sqlite3 (synchronous API) — no promises needed.
 * Tracks every inserted row in demo_seeds for clean reset.
 */

import db from '../db.js';

// ── Tracking table ────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS demo_seeds (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT    NOT NULL,
    row_id     INTEGER NOT NULL,
    seeded_at  TEXT    DEFAULT CURRENT_TIMESTAMP
  )
`);

// ── Helpers ───────────────────────────────────────────────────────────────────
const ago  = (n) => new Date(Date.now() - n * 86_400_000).toISOString().replace('T',' ').slice(0,19);
const fwd  = (n) => new Date(Date.now() + n * 86_400_000).toISOString().replace('T',' ').slice(0,19);
const pick = (arr, i) => arr[i % arr.length];
const lerp = (lo, hi, t) => Math.round(lo + (hi - lo) * t);

let _tok = 8000;
const tok = () => `demo${(++_tok).toString(36).padStart(6,'0')}`;

const insTrack = db.prepare(`INSERT INTO demo_seeds (table_name, row_id) VALUES (?,?)`);
function track(tbl, id) { insTrack.run(tbl, id); return id; }

// ── Status check ──────────────────────────────────────────────────────────────
export function isDemoSeeded() {
  return db.prepare(`SELECT COUNT(*) AS n FROM demo_seeds`).get().n > 0;
}

// ── Reset ─────────────────────────────────────────────────────────────────────
export function resetDemoData() {
  const rows = db.prepare(`SELECT table_name, row_id FROM demo_seeds ORDER BY id DESC`).all();
  const byTable = {};
  for (const { table_name, row_id } of rows) {
    (byTable[table_name] ??= []).push(row_id);
  }
  const order = [
    'job_pairs','maintenance_alerts','maintenance_costs','vehicle_maintenance',
    'fuel_transactions','fuel_cards','job_referrals','partner_companies',
    'audit_log','driver_hours','invoices','counter_offers','quote_messages',
    'upphandlingar','jobs','quotes','customers','drivers','company_fleet',
  ];
  db.transaction(() => {
    for (const tbl of order) {
      const ids = byTable[tbl];
      if (!ids?.length) continue;
      db.prepare(`DELETE FROM "${tbl}" WHERE id IN (${ids.map(()=>'?').join(',')})`).run(...ids);
    }
    db.exec(`DELETE FROM demo_seeds`);
    // Reset invoice counter so real invoices renumber from where they were
    db.exec(`UPDATE companies SET faktura_counter = MAX(0, faktura_counter - 45) WHERE id = 1`);
  })();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER DATA ARRAYS
// ═══════════════════════════════════════════════════════════════════════════════

const FLEET = [
  { ext_id:'KEM-01', reg:'ABC 123', namn:'Volvo FH 540 Kranbil',         lasttyp:'kranbil',       typ:'kranbil',       max_last_kg:24000, volym_m3:null, lez_godkand:1, euro_klass:6, timkostnad_sek:950, priskm_sek:22, startavgift_sek:1200, forbrukning_l_per_km:0.38, beskrivning:'Kranlyft och tunga transporter. Euro 6. ADR klass 3.' },
  { ext_id:'KEM-02', reg:'DEF 456', namn:'Scania R 500 Lastväxlare',     lasttyp:'lastväxlare',   typ:'lastväxlare',   max_last_kg:20000, volym_m3:36,   lez_godkand:1, euro_klass:6, timkostnad_sek:875, priskm_sek:20, startavgift_sek:900,  forbrukning_l_per_km:0.35, beskrivning:'Lastväxlare med flakbyte. Container och skrothämtning.' },
  { ext_id:'KEM-03', reg:'GHI 789', namn:'Volvo FM 460 Flakbil',         lasttyp:'flakbil',       typ:'flakbil',       max_last_kg:18000, volym_m3:42,   lez_godkand:1, euro_klass:6, timkostnad_sek:820, priskm_sek:18, startavgift_sek:700,  forbrukning_l_per_km:0.33, beskrivning:'Öppet flak med bakgavellyft. Allmän godstransport.' },
  { ext_id:'KEM-04', reg:'JKL 012', namn:'Scania G 410 Boggi',           lasttyp:'boggibil',      typ:'boggibil',      max_last_kg:26000, volym_m3:null, lez_godkand:0, euro_klass:5, timkostnad_sek:780, priskm_sek:16, startavgift_sek:600,  forbrukning_l_per_km:0.40, beskrivning:'Tippbil för massor och schakt. Ej LEZ-godkänd.' },
  { ext_id:'KEM-05', reg:'MNO 345', namn:'Mercedes Actros med släp',     lasttyp:'dragbil',       typ:'dragbil',       max_last_kg:22000, volym_m3:82,   lez_godkand:1, euro_klass:6, timkostnad_sek:920, priskm_sek:24, startavgift_sek:1500, forbrukning_l_per_km:0.36, beskrivning:'Dragbil med kapellsläp. Lång distans, täckt gods.' },
  { ext_id:'KEM-06', reg:'PQR 678', namn:'MAN TGX Containerbil',         lasttyp:'containerbil',  typ:'containerbil',  max_last_kg:20000, volym_m3:null, lez_godkand:1, euro_klass:6, timkostnad_sek:860, priskm_sek:21, startavgift_sek:1100, forbrukning_l_per_km:0.34, beskrivning:'Specialfordon 20/40 fot container.' },
];

const DRIVERS = [
  { name:'Lars Andersson',  phone:'+46 70 123 45 67', truck_id:'DEMO-DRV-01' },
  { name:'Mikael Eriksson', phone:'+46 70 234 56 78', truck_id:'DEMO-DRV-02' },
  { name:'Johan Persson',   phone:'+46 70 345 67 89', truck_id:'DEMO-DRV-03' },
  { name:'Anders Lindgren', phone:'+46 70 456 78 90', truck_id:'DEMO-DRV-04' },
  { name:'Per Karlsson',    phone:'+46 70 567 89 01', truck_id:'DEMO-DRV-05' },
  { name:'Magnus Nilsson',  phone:'+46 70 678 90 12', truck_id:'DEMO-DRV-06' },
  { name:'Stefan Holmberg', phone:'+46 70 789 01 23', truck_id:'DEMO-DRV-07' },
  { name:'Fredrik Olsson',  phone:'+46 70 890 12 34', truck_id:'DEMO-DRV-08' },
];

const CUSTOMERS = [
  { name:'Sveabyggen AB',                        org_nr:'556234-5678', address:'Hornsbruksgatan 28', zip_code:'117 34', city:'Stockholm',     phone:'+46 8 441 23 00',    email:'transport@sveabyggen.se' },
  { name:'NCC Anläggning AB',                    org_nr:'556030-6837', address:'Vallgatan 3',         zip_code:'170 67', city:'Solna',         phone:'+46 8 585 510 00',   email:'logistik@ncc.se' },
  { name:'Skanska Sverige AB',                   org_nr:'556453-1823', address:'Klarabergsviadukten 90', zip_code:'111 64', city:'Stockholm',  phone:'+46 10 448 00 00',   email:'transport@skanska.se' },
  { name:'Peab Mark AB',                         org_nr:'556185-4448', address:'Råsundavägen 1',      zip_code:'169 55', city:'Solna',         phone:'+46 510 970 00',     email:'mark@peab.se' },
  { name:'Stockholms Byggentreprenad AB',         org_nr:'556789-1234', address:'Lövholmsbrinken 1',  zip_code:'117 43', city:'Stockholm',     phone:'+46 8 556 89 00',    email:'order@stobygg.se' },
  { name:'Mälardalens Schakt AB',                org_nr:'556432-8765', address:'Industrivägen 4',     zip_code:'723 48', city:'Västerås',      phone:'+46 21 123 45 67',   email:'transport@malarschakt.se' },
  { name:'Veidekke Entreprenad AB',              org_nr:'556579-3210', address:'Fabriksgatan 7',      zip_code:'112 33', city:'Stockholm',     phone:'+46 8 635 69 00',    email:'drift@veidekke.se' },
  { name:'JM Bostäder AB',                       org_nr:'556045-3367', address:'Adolf Edelsvärdsgatan 11', zip_code:'121 50', city:'Johanneshov', phone:'+46 8 782 87 00', email:'logistik@jm.se' },
  { name:'HSB Stockholm',                        org_nr:'702001-3789', address:'Folkungagatan 44',    zip_code:'116 79', city:'Stockholm',     phone:'+46 8 749 40 00',    email:'fastighet@hsb.se' },
  { name:'Riksbyggen',                           org_nr:'702001-7829', address:'Sveavägen 64',        zip_code:'113 59', city:'Stockholm',     phone:'+46 10 470 50 00',   email:'transport@riksbyggen.se' },
  { name:'Familjebostäder AB',                   org_nr:'556049-3150', address:'Birkagatan 27',       zip_code:'113 36', city:'Stockholm',     phone:'+46 8 508 34 000',   email:'drift@familjebostader.se' },
  { name:'Stockholmshem AB',                     org_nr:'556013-0924', address:'Alströmergatan 14',   zip_code:'112 47', city:'Stockholm',     phone:'+46 8 508 37 000',   email:'order@stockholmshem.se' },
  { name:'Einar Mattsson Byggnads AB',           org_nr:'556056-8924', address:'Bellmansgatan 15',    zip_code:'118 47', city:'Stockholm',     phone:'+46 8 556 30 00',    email:'byggtransport@einarmattsson.se' },
  { name:'Serneke Bygg AB',                      org_nr:'559101-4501', address:'Kvarnbergsgatan 2',   zip_code:'400 43', city:'Göteborg',      phone:'+46 31 712 97 00',   email:'logistik@serneke.se' },
  { name:'Wästbygg Projektutveckling AB',        org_nr:'556093-2465', address:'Byfogdegatan 4',      zip_code:'415 05', city:'Göteborg',      phone:'+46 31 80 88 00',    email:'transport@wastbygg.se' },
  { name:'ByggVesta Sverige AB',                 org_nr:'556788-9012', address:'Ringvägen 100',       zip_code:'118 60', city:'Stockholm',     phone:'+46 8 556 99 00',    email:'bygg@byggvesta.se' },
  { name:'Tornberget Fastighetsförvaltning AB',  org_nr:'556567-1230', address:'Tomtebogatan 31',     zip_code:'113 38', city:'Stockholm',     phone:'+46 8 508 44 000',   email:'fastighet@tornberget.se' },
  { name:'Stockholms Stad - Fastighetskontoret', org_nr:'212000-0142', address:'Hantverkargatan 2F',  zip_code:'105 35', city:'Stockholm',     phone:'+46 8 508 27 000',   email:'fastighet@stockholm.se' },
];

const ROUTES = [
  { from:'Hammarby Sjöstad, Stockholm',  to:'Södertälje industriområde',     km:38, lez:0 },
  { from:'Solna Business Park',          to:'Nacka industriområde',          km:22, lez:1 },
  { from:'Kungsholmen, Stockholm',       to:'Sundbyberg centrum',            km:8,  lez:1 },
  { from:'Farsta strand, Stockholm',     to:'Bromma flygplats',              km:18, lez:0 },
  { from:'Slussen, Stockholm',           to:'Uppsala centralstation',        km:73, lez:0 },
  { from:'Täby centrum',                 to:'Lidingö stad',                  km:17, lez:0 },
  { from:'Järfälla industriområde',      to:'Huddinge centrum',              km:29, lez:0 },
  { from:'Stockholm Centralstation',     to:'Norrtälje hamn',                km:82, lez:0 },
  { from:'Liljeholmen, Stockholm',       to:'Djurgårdens brygga, Stockholm', km:7,  lez:1 },
  { from:'Östermalm, Stockholm',         to:'Botkyrka industrimark',         km:25, lez:0 },
  { from:'Haninge centrum',              to:'Stockholms hamn, Frihamnen',    km:31, lez:0 },
  { from:'Lidingö stad',                 to:'Upplands Väsby industripark',   km:32, lez:0 },
  { from:'Nacka forum',                  to:'Bromma industriområde',         km:20, lez:1 },
  { from:'Tyresö centrum',               to:'Kista Science City',            km:36, lez:0 },
  { from:'Ekerö hamn',                   to:'Globen, Södermalm, Stockholm',  km:27, lez:0 },
  { from:'Vällingby centrum',            to:'Djursholm industrimark',        km:23, lez:0 },
  { from:'Hässelby strand, Stockholm',   to:'Huddinge sjukhus',              km:22, lez:0 },
  { from:'Tullinge industripark',        to:'Rinkeby, Stockholm',            km:34, lez:0 },
];

// Each cargo type is paired with the best-fit vehicle ext_id
const CARGO = [
  { typ:'Kranlyft',             min:14000, max:28000, veh:'KEM-01', tim:6.0 },
  { typ:'Grävmaskin transport', min:8500,  max:18000, veh:'KEM-04', tim:4.5 },
  { typ:'Prefab-element',       min:9000,  max:22000, veh:'KEM-05', tim:5.0 },
  { typ:'Containertransport',   min:5000,  max:12000, veh:'KEM-06', tim:3.5 },
  { typ:'Betongleverans',       min:3500,  max:8000,  veh:'KEM-03', tim:2.5 },
  { typ:'Asfalt och beläggning',min:4000,  max:9500,  veh:'KEM-04', tim:3.0 },
  { typ:'Jordmassor',           min:4500,  max:10000, veh:'KEM-04', tim:3.5 },
  { typ:'Byggmaterial',         min:3500,  max:8500,  veh:'KEM-03', tim:2.5 },
  { typ:'Maskintransport',      min:7000,  max:16000, veh:'KEM-01', tim:4.0 },
  { typ:'Lastväxlarflak',       min:4500,  max:11000, veh:'KEM-02', tim:3.0 },
  { typ:'Stål och armering',    min:5500,  max:13000, veh:'KEM-05', tim:3.5 },
  { typ:'Rivningsmassor',       min:5000,  max:12000, veh:'KEM-04', tim:4.0 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export function seedDemoData() {
  const CID = 1; // company_id

  // Get the owner user for audit log attribution
  const ownerUser = db.prepare(`SELECT id, name FROM users WHERE company_id = ? AND role = 'agare' LIMIT 1`).get(CID);
  const userId = ownerUser?.id ?? 1;

  db.transaction(() => {
    // ── 1. Fleet ───────────────────────────────────────────────────────────────
    const insFleet = db.prepare(`
      INSERT INTO company_fleet
        (company_id,ext_id,reg,namn,lasttyp,typ,max_last_kg,volym_m3,lez_godkand,
         euro_klass,timkostnad_sek,priskm_sek,startavgift_sek,forbrukning_l_per_km,beskrivning)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const fleetIds = {};
    for (const v of FLEET) {
      // Skip if already exists by ext_id
      const ex = db.prepare(`SELECT id FROM company_fleet WHERE company_id=? AND ext_id=?`).get(CID,v.ext_id);
      if (ex) { fleetIds[v.ext_id] = ex.id; continue; }
      const id = insFleet.run(CID,v.ext_id,v.reg,v.namn,v.lasttyp,v.typ,v.max_last_kg,
        v.volym_m3,v.lez_godkand,v.euro_klass,v.timkostnad_sek,v.priskm_sek,
        v.startavgift_sek,v.forbrukning_l_per_km,v.beskrivning).lastInsertRowid;
      fleetIds[v.ext_id] = id;
      track('company_fleet', id);
    }

    // ── 2. Drivers ─────────────────────────────────────────────────────────────
    const insDrv = db.prepare(`INSERT INTO drivers (company_id,name,phone,truck_id) VALUES (?,?,?,?)`);
    const driverIds = [];
    for (const d of DRIVERS) {
      const ex = db.prepare(`SELECT id FROM drivers WHERE company_id=? AND name=?`).get(CID,d.name);
      if (ex) { driverIds.push(ex.id); continue; }
      const id = insDrv.run(CID,d.name,d.phone,d.truck_id).lastInsertRowid;
      driverIds.push(id);
      track('drivers', id);
    }

    // ── 3. Customers ───────────────────────────────────────────────────────────
    const insCust = db.prepare(`
      INSERT INTO customers (company_id,fortnox_customer_nr,name,address,zip_code,city,phone,email,org_nr)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const custIds = [];
    for (let i = 0; i < CUSTOMERS.length; i++) {
      const c = CUSTOMERS[i];
      const nr = `DEMO-${String(i+1).padStart(3,'0')}`;
      const ex = db.prepare(`SELECT id FROM customers WHERE company_id=? AND fortnox_customer_nr=?`).get(CID,nr);
      if (ex) { custIds.push(ex.id); continue; }
      const id = insCust.run(CID,nr,c.name,c.address,c.zip_code,c.city,c.phone,c.email,c.org_nr).lastInsertRowid;
      custIds.push(id);
      track('customers', id);
    }

    // ── 4. Quotes — 60 recent (90 days) + 23 older (91-180 days) ──────────────
    const insQ = db.prepare(`
      INSERT INTO quotes
        (company_id,token,status,lasttyp,upphämtning,leverans,datum,fordon_id,
         avstand_km,totalpris_sek,bränsle_kostnad,arbetstid_kostnad,arbetstid_timmar,
         confidence_score,review_status,customer_name,customer_email,lez_varning,
         noteringar,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    // Status distribution for the 60 recent quotes:
    // 22 godkänd, 14 skickad, 11 avböjd, 8 väntande, 5 motbud
    const recentStatuses = [
      ...Array(22).fill('godkänd'),
      ...Array(14).fill('skickad'),
      ...Array(11).fill('avböjd'),
      ...Array(8).fill('väntande'),
      ...Array(5).fill('motbud'),
    ];
    // Shuffle deterministically by index
    const shuffled = recentStatuses.sort((a,b) => a.localeCompare(b));

    const quoteIds = []; // all quote ids, indexed
    const godkandQuoteIds = []; // subset: accepted
    const motbudQuoteIds = []; // subset: counter-offers

    // 60 recent quotes spread over 90 days
    for (let i = 0; i < 60; i++) {
      const status = shuffled[i];
      const daysBack = Math.round(1 + (i / 59) * 88); // 1..89 days ago
      const route = pick(ROUTES, i * 3 + 7);
      const cargo = pick(CARGO, i * 5 + 2);
      const cust  = CUSTOMERS[i % CUSTOMERS.length];
      const t     = i / 59; // 0..1
      const price = lerp(cargo.min, cargo.max, (Math.sin(i * 2.3) + 1) / 2);
      const fuel  = Math.round(price * 0.12);
      const tim   = cargo.tim + (i % 3) * 0.5;
      const arbKost = Math.round(tim * 820);
      const conf  = 0.72 + (i % 12) * 0.02;
      const qId = insQ.run(
        CID, tok(), status,
        cargo.typ, route.from, route.to,
        ago(daysBack).slice(0,10),
        cargo.veh,
        route.km,
        price, fuel, arbKost, tim,
        conf, 'ok',
        cust.name, cust.email,
        route.lez,
        status === 'avböjd' ? 'Kunden valde annan leverantör.' : null,
        ago(daysBack)
      ).lastInsertRowid;
      track('quotes', qId);
      quoteIds.push(qId);
      if (status === 'godkänd') godkandQuoteIds.push({ qId, daysBack, route, cargo, price, cust, i });
      if (status === 'motbud')  motbudQuoteIds.push(qId);
    }

    // 23 older accepted quotes (91-180 days ago) to fill jobs to 45
    for (let i = 0; i < 23; i++) {
      const daysBack = 91 + Math.round((i / 22) * 87);
      const route = pick(ROUTES, i * 7 + 1);
      const cargo = pick(CARGO, i * 3 + 4);
      const cust  = CUSTOMERS[(i + 7) % CUSTOMERS.length];
      const price = lerp(cargo.min, cargo.max, (Math.sin(i * 1.7) + 1) / 2);
      const fuel  = Math.round(price * 0.12);
      const tim   = cargo.tim;
      const qId = insQ.run(
        CID, tok(), 'godkänd',
        cargo.typ, route.from, route.to,
        ago(daysBack).slice(0,10),
        cargo.veh,
        route.km,
        price, fuel, Math.round(tim * 820), tim,
        0.85, 'ok',
        cust.name, cust.email,
        route.lez, null, ago(daysBack)
      ).lastInsertRowid;
      track('quotes', qId);
      quoteIds.push(qId);
      godkandQuoteIds.push({ qId, daysBack, route, cargo, price, cust, i: i + 60 });
    }

    // Counter-offer records for motbud quotes
    const insCO = db.prepare(`
      INSERT INTO counter_offers (quote_id,proposed_price_sek,note,status,created_at)
      VALUES (?,?,?,?,?)
    `);
    for (const qId of motbudQuoteIds) {
      const q = db.prepare(`SELECT totalpris_sek,created_at FROM quotes WHERE id=?`).get(qId);
      const proposed = Math.round(q.totalpris_sek * 0.88);
      const coId = insCO.run(qId, proposed, 'Kan ni gå ned något? Vi har fler jobb framöver.', 'pending', q.created_at).lastInsertRowid;
      track('counter_offers', coId);
    }

    // ── 5. Jobs — 45 total from godkänd quotes ─────────────────────────────────
    // Status distribution: 18 slutförd, 8 fakturerad, 6 pågående, 13 planerad
    const JOB_STATUSES = [
      ...Array(18).fill('slutförd'),
      ...Array(8).fill('fakturerad'),
      ...Array(6).fill('pågående'),
      ...Array(13).fill('planerad'),
    ];

    const insJob = db.prepare(`
      INSERT INTO jobs (company_id,quote_id,status,customer_id,created_at)
      VALUES (?,?,?,?,?)
    `);
    const jobRecords = []; // { jobId, status, quoteId, daysBack, price }

    for (let i = 0; i < 45; i++) {
      const { qId, daysBack, price, cust } = godkandQuoteIds[i];
      const status = JOB_STATUSES[i];
      const custId = custIds[CUSTOMERS.findIndex(c => c.email === cust.email)];
      const jobId = insJob.run(CID, qId, status, custId, ago(daysBack - 0.5)).lastInsertRowid;
      track('jobs', jobId);
      jobRecords.push({ jobId, status, quoteId: qId, daysBack, price, custId, cust });
    }

    // ── 6. Invoices — 26 total ─────────────────────────────────────────────────
    // 20 betald, 4 utestaende, 2 förfallen
    // Slutförd jobs: all get betald invoices (18)
    // Fakturerad jobs: 2 betald, 4 utestaende, 2 förfallen (8 total)
    const insInv = db.prepare(`
      INSERT INTO invoices
        (company_id,job_id,faktura_nr,customer_name,customer_org_nr,customer_address,
         customer_email,line_items,subtotal,vat,total,due_date,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    // Get current faktura counter
    const company = db.prepare(`SELECT faktura_counter FROM companies WHERE id=?`).get(CID);
    let fCounter = (company?.faktura_counter ?? 0);

    const slutfordJobs = jobRecords.filter(j => j.status === 'slutförd');
    const fakturJobs   = jobRecords.filter(j => j.status === 'fakturerad');
    const fakturaStatuses = ['betald','betald','utestaende','utestaende','utestaende','utestaende','förfallen','förfallen'];

    const toInvoice = [
      ...slutfordJobs.map((j,_) => ({ ...j, invStatus: 'betald' })),
      ...fakturJobs.map((j,fi) => ({ ...j, invStatus: fakturaStatuses[fi] })),
    ];

    for (const { jobId, price, cust, daysBack, invStatus } of toInvoice) {
      fCounter++;
      const fnr = `FAK-2026-${String(fCounter).padStart(3,'0')}`;
      const subtotal = price;
      const vat = Math.round(subtotal * 0.25);
      const total = subtotal + vat;
      const custData = CUSTOMERS.find(c => c.email === cust.email) ?? CUSTOMERS[0];
      const dueDate = ago(daysBack - 30).slice(0,10);
      const lineItems = JSON.stringify([
        { beskrivning: 'Transporttjänst', antal: 1, apris: subtotal, belopp: subtotal },
      ]);
      const invId = insInv.run(
        CID, jobId, fnr,
        custData.name, custData.org_nr,
        `${custData.address}, ${custData.zip_code} ${custData.city}`,
        custData.email, lineItems,
        subtotal, vat, total, dueDate,
        invStatus, ago(daysBack + 1)
      ).lastInsertRowid;
      track('invoices', invId);
      // Write faktura_nr back to job
      db.prepare(`UPDATE jobs SET faktura_nr=? WHERE id=?`).run(fnr, jobId);
    }
    db.prepare(`UPDATE companies SET faktura_counter=? WHERE id=?`).run(fCounter, CID);

    // ── 7. Driver hours (EU 561) ───────────────────────────────────────────────
    const insDH = db.prepare(`
      INSERT INTO driver_hours (company_id,driver_id,job_id,date,driving_minutes,work_minutes,rest_minutes,source)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    // Give pågående and recent slutförd jobs driving hours
    const activeJobs = jobRecords.filter(j => j.status === 'pågående' || j.status === 'slutförd');
    for (let i = 0; i < activeJobs.length; i++) {
      const { jobId, daysBack } = activeJobs[i];
      const drvId = driverIds[i % driverIds.length];
      // Some drivers near the 56h weekly limit
      const driving = 180 + (i % 5) * 60; // 3h–7h per job
      const work    = driving + 30;
      const rest    = 660 - work;
      const dhId = insDH.run(CID, drvId, jobId, ago(daysBack).slice(0,10), driving, work, Math.max(rest,0), 'manual').lastInsertRowid;
      track('driver_hours', dhId);
    }

    // ── 8. Vehicle maintenance ─────────────────────────────────────────────────
    const insMaint = db.prepare(`
      INSERT INTO vehicle_maintenance
        (company_id,vehicle_id,besiktning_datum,forsakring_datum,adr_datum,
         service_datum,service_km,current_km,sommar_dack_datum,vinter_dack_datum)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(company_id,vehicle_id) DO UPDATE SET
        besiktning_datum=excluded.besiktning_datum,
        forsakring_datum=excluded.forsakring_datum,
        service_datum=excluded.service_datum,
        current_km=excluded.current_km,
        sommar_dack_datum=excluded.sommar_dack_datum,
        vinter_dack_datum=excluded.vinter_dack_datum
    `);

    const MAINT_CONFIG = [
      { ext_id:'KEM-01', bes: fwd(80),  ins: fwd(25),  adr: fwd(280), km:340000, svc: ago(45),  svc_km:338000, sommer: ago(45).slice(0,10), vinter: ago(220).slice(0,10) },
      { ext_id:'KEM-02', bes: fwd(140), ins: fwd(62),  adr: null,     km:210000, svc: ago(32),  svc_km:208500, sommer: ago(45).slice(0,10), vinter: ago(220).slice(0,10) },
      { ext_id:'KEM-03', bes: fwd(21),  ins: fwd(95),  adr: null,     km:185000, svc: ago(18),  svc_km:184200, sommer: ago(45).slice(0,10), vinter: ago(220).slice(0,10) },
      { ext_id:'KEM-04', bes: fwd(195), ins: fwd(14),  adr: null,     km:620000, svc: ago(90),  svc_km:615000, sommer: ago(45).slice(0,10), vinter: ago(220).slice(0,10) },
      { ext_id:'KEM-05', bes: fwd(55),  ins: fwd(110), adr: fwd(180), km:295000, svc: ago(60),  svc_km:292000, sommer: ago(45).slice(0,10), vinter: ago(220).slice(0,10) },
      { ext_id:'KEM-06', bes: fwd(165), ins: fwd(7),   adr: null,     km:156000, svc: ago(28),  svc_km:155200, sommer: ago(45).slice(0,10), vinter: ago(220).slice(0,10) },
    ];

    for (const m of MAINT_CONFIG) {
      const ex = db.prepare(`SELECT id FROM vehicle_maintenance WHERE company_id=? AND vehicle_id=?`).get(CID, m.ext_id);
      insMaint.run(CID,m.ext_id,m.bes.slice(0,10),m.ins.slice(0,10),m.adr?.slice(0,10)??null,
        m.svc.slice(0,10),m.svc_km,m.km,m.sommer,m.vinter);
      if (!ex) {
        const newRow = db.prepare(`SELECT id FROM vehicle_maintenance WHERE company_id=? AND vehicle_id=?`).get(CID, m.ext_id);
        if (newRow) track('vehicle_maintenance', newRow.id);
      }
    }

    // Maintenance cost history (4-6 records per truck)
    const insMCost = db.prepare(`
      INSERT INTO maintenance_costs (company_id,vehicle_id,typ,beskrivning,belopp_sek,datum,km_vid_service)
      VALUES (?,?,?,?,?,?,?)
    `);
    const COST_RECORDS = [
      ['KEM-01', 'service',    'Oljebyte + filter',             4200, ago(45),  338000],
      ['KEM-01', 'service',    'Bromsservice fram',             8900, ago(130), 325000],
      ['KEM-01', 'dack',       'Vinterdäck montering',          3800, ago(220), 312000],
      ['KEM-01', 'reparation', 'Hydraulikledning byte',         6400, ago(280), 305000],
      ['KEM-01', 'service',    'Kamremsbyte',                  16500, ago(365), 290000],
      ['KEM-02', 'service',    'Oljebyte + filter',             3800, ago(32),  208500],
      ['KEM-02', 'service',    'Bromsservice bak',              7200, ago(95),  200000],
      ['KEM-02', 'dack',       'Sommardäck montering',          3400, ago(45),  207000],
      ['KEM-02', 'dack',       'Vinterdäck montering',          3400, ago(220), 195000],
      ['KEM-03', 'service',    'Oljebyte + luftfilter',         3600, ago(18),  184200],
      ['KEM-03', 'service',    'AC-service',                    2800, ago(80),  178000],
      ['KEM-03', 'dack',       'Sommardäck komplett',           4200, ago(45),  183000],
      ['KEM-03', 'besiktning', 'Besiktning godkänd',            1200, ago(21),  184100],
      ['KEM-04', 'service',    'Oljebyte stor service',         7800, ago(90),  615000],
      ['KEM-04', 'service',    'Bromsservice + beläggen',      11200, ago(180), 605000],
      ['KEM-04', 'dack',       'Däckbyte komplett (8 st)',      9600, ago(220), 602000],
      ['KEM-04', 'reparation', 'Differentialreparation',       18000, ago(320), 592000],
      ['KEM-04', 'reparation', 'Avgassystem byte',             14500, ago(400), 580000],
      ['KEM-05', 'service',    'Oljebyte + filter',             4400, ago(60),  292000],
      ['KEM-05', 'service',    'Bromsservice komplett',        12600, ago(150), 283000],
      ['KEM-05', 'dack',       'Sommardäck montering + balans', 5200, ago(45),  291000],
      ['KEM-05', 'service',    'Kamremsbyte',                  15800, ago(280), 272000],
      ['KEM-06', 'service',    'Oljebyte + filter',             3500, ago(28),  155200],
      ['KEM-06', 'service',    'Bromsservice',                  6800, ago(100), 149000],
      ['KEM-06', 'dack',       'Vinterdäck montering',          3200, ago(220), 138000],
      ['KEM-06', 'besiktning', 'Besiktning godkänd',            1200, ago(165), 153000],
    ];
    for (const [vid, typ, beskr, belopp, datum, km] of COST_RECORDS) {
      const id = insMCost.run(CID, vid, typ, beskr, belopp, datum.slice(0,10), km).lastInsertRowid;
      track('maintenance_costs', id);
    }

    // ── 9. Partner companies + referrals ───────────────────────────────────────
    const insPartner = db.prepare(`
      INSERT OR IGNORE INTO partner_companies
        (company_id,partner_name,org_nr,contact_name,contact_phone,contact_email,notes,aktiv)
      VALUES (?,?,?,?,?,?,?,1)
    `);
    const PARTNERS = [
      { name:'Norrtälje Transport AB',   org:'556345-6789', contact:'Erik Lindqvist',  phone:'+46 70 112 23 34', email:'erik@norrtäljetransport.se',  notes:'Norr om Stockholm, bra täckning i Roslagen.' },
      { name:'Södertörn Lastbil AB',     org:'556456-7890', contact:'Anna Bergström',  phone:'+46 70 223 34 45', email:'anna@sodertornlastbil.se',     notes:'Täcker Södertörn och Haninge bra.' },
      { name:'Mälaren Frakt AB',         org:'556567-8901', contact:'Björn Gustafsson',phone:'+46 70 334 45 56', email:'bjorn@maraenfrakt.se',         notes:'Mälardalen och Västerås-regionen.' },
      { name:'Roslagen Schakt AB',       org:'556678-9012', contact:'Gunnar Holm',     phone:'+46 70 445 56 67', email:'gunnar@rosagenachakt.se',      notes:'Schakt och massor i Norrtälje-regionen.' },
    ];
    const partnerIds = [];
    for (const p of PARTNERS) {
      insPartner.run(CID, p.name, p.org, p.contact, p.phone, p.email, p.notes);
      const row = db.prepare(`SELECT id FROM partner_companies WHERE company_id=? AND partner_name=?`).get(CID, p.name);
      partnerIds.push(row.id);
      // Only track if newly inserted (check demo_seeds)
      const alreadyTracked = db.prepare(`SELECT 1 FROM demo_seeds WHERE table_name='partner_companies' AND row_id=?`).get(row.id);
      if (!alreadyTracked) track('partner_companies', row.id);
    }

    // 8 referrals across these partners
    const insRef = db.prepare(`
      INSERT INTO job_referrals
        (company_id,partner_company_id,quote_id,riktning,lasttyp,upphämtning,leverans,
         datum,overenskommet_totalpris_sek,formedlingsavgift_pct,partner_pris_sek,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const REFERRALS = [
      // Outbound: we sent to partner (balance: Norrtälje owes us)
      { pid:0, qIdx:5,  dir:'ut', pris:14800, fee:10, stat:'utfört',    dBack:62  },
      { pid:0, qIdx:12, dir:'ut', pris:8400,  fee:10, stat:'utfört',    dBack:41  },
      { pid:0, qIdx:20, dir:'ut', pris:11200, fee:10, stat:'accepterad', dBack:15  },
      { pid:2, qIdx:8,  dir:'ut', pris:9600,  fee:10, stat:'utfört',    dBack:55  },
      // Inbound: partner sent to us (balance: we owe Södertörn)
      { pid:1, qIdx:3,  dir:'in', pris:7200,  fee:10, stat:'utfört',    dBack:48  },
      { pid:1, qIdx:15, dir:'in', pris:12800, fee:10, stat:'utfört',    dBack:29  },
      // Roslagen (balance positive for us)
      { pid:3, qIdx:18, dir:'ut', pris:15600, fee:10, stat:'utfört',    dBack:72  },
      { pid:3, qIdx:25, dir:'ut', pris:9800,  fee:10, stat:'accepterad', dBack:8   },
    ];
    for (const r of REFERRALS) {
      const { qId, route, cargo } = godkandQuoteIds[r.qIdx % godkandQuoteIds.length];
      const partnerPris = Math.round(r.pris * (1 - r.fee/100));
      const refId = insRef.run(
        CID, partnerIds[r.pid], qId, r.dir,
        cargo.typ, route.from, route.to,
        ago(r.dBack).slice(0,10),
        r.pris, r.fee, partnerPris, r.stat, ago(r.dBack)
      ).lastInsertRowid;
      track('job_referrals', refId);
    }

    // ── 10. Fuel cards + 90 days of transactions ───────────────────────────────
    const insFC = db.prepare(`
      INSERT OR IGNORE INTO fuel_cards (company_id,card_number,vehicle_id,provider,holder_name,aktiv)
      VALUES (?,?,?,?,?,1)
    `);
    const CARDS = [
      { card:'CIRCLK-4521', veh:'KEM-01', provider:'Circle K',  holder:'Lars Andersson'  },
      { card:'PREEM-7834',  veh:'KEM-03', provider:'Preem',     holder:'Johan Persson'   },
      { card:'OKQ8-2219',   veh:'KEM-05', provider:'OKQ8',      holder:'Per Karlsson'    },
    ];
    const cardIds = {};
    for (const c of CARDS) {
      const vid = fleetIds[c.veh];
      insFC.run(CID, c.card, vid, c.provider, c.holder);
      const row = db.prepare(`SELECT id FROM fuel_cards WHERE company_id=? AND card_number=?`).get(CID, c.card);
      cardIds[c.card] = row.id;
      const alreadyTracked = db.prepare(`SELECT 1 FROM demo_seeds WHERE table_name='fuel_cards' AND row_id=?`).get(row.id);
      if (!alreadyTracked) track('fuel_cards', row.id);
    }

    const STATIONS = ['Circle K Södertälje','Preem Kungsholmen','OKQ8 Bromma','Circle K Nacka','Preem Järfälla','OKQ8 Huddinge','Circle K Uppsala','Preem Solna'];
    const insFT = db.prepare(`
      INSERT INTO fuel_transactions
        (company_id,card_number,vehicle_id,transaction_date,station_name,fuel_type,litres,amount_sek,price_per_litre,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    const cardList = Object.entries(cardIds);
    for (let i = 0; i < 100; i++) {
      const dayBack = Math.round(1 + (i / 99) * 89);
      const [card, cardId] = pick(cardList, i);
      const vehId = fleetIds[pick(['KEM-01','KEM-03','KEM-05'], i)];
      const litres = 60 + (i % 12) * 10;  // 60-170 L
      const ppl    = 21.20 + (i % 8) * 0.10; // 21.20-21.90
      const amt    = Math.round(litres * ppl);
      const station = pick(STATIONS, i * 3 + 1);
      const tId = insFT.run(
        CID, card, vehId, ago(dayBack).slice(0,10),
        station, 'B7 Diesel', litres, amt, ppl, ago(dayBack)
      ).lastInsertRowid;
      track('fuel_transactions', tId);
    }

    // ── 11. Tenders / Upphandlingar ────────────────────────────────────────────
    const insUpp = db.prepare(`
      INSERT OR IGNORE INTO upphandlingar
        (company_id,external_id,source,titel,kopare,region,nuts_kod,cpv_koder,
         estimerat_varde_sek,deadline,publiceringsdatum,beskrivning,url,
         relevans_score,flotta_kan_hantera,co2_fordel,dismissed,hamtad_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,0,?)
    `);
    const TENDERS = [
      { eid:'TED-2026-SE-001', titel:'Transporttjänster för infrastrukturprojekt Södra länken',   kopare:'Trafikverket',          region:'Stockholm',  nuts:'SE110', cpv:'60100000', varde:3800000, dead: fwd(45), pub: ago(15), rel:89, co2:1 },
      { eid:'TED-2026-SE-002', titel:'Massornas bortforsling Norra Djurgårdsstaden, etapp 3',      kopare:'Stockholms Stad',       region:'Stockholm',  nuts:'SE110', cpv:'90511000', varde:1250000, dead: fwd(28), pub: ago(8),  rel:82, co2:0 },
      { eid:'TED-2026-SE-003', titel:'Containertransporter kommunens fastighetsbestånd 2026-2028', kopare:'Nacka Kommun',          region:'Stockholm',  nuts:'SE110', cpv:'60100000', varde:820000,  dead: fwd(61), pub: ago(22), rel:74, co2:0 },
      { eid:'TED-2026-SE-004', titel:'Schakt och fyllnadsmassor Huddinge sjukhusområde',           kopare:'Huddinge Kommun',       region:'Stockholm',  nuts:'SE110', cpv:'45112400', varde:2200000, dead: fwd(35), pub: ago(5),  rel:78, co2:0 },
      { eid:'TED-2026-SE-005', titel:'Upphandling av materialtransporter, Region Stockholm 2026',  kopare:'Region Stockholm',      region:'Stockholm',  nuts:'SE110', cpv:'60100000', varde:4200000, dead: fwd(82), pub: ago(30), rel:67, co2:1 },
      { eid:'TED-2026-SE-006', titel:'Ramavtal transporter och maskintjänster Botkyrka Kommun',    kopare:'Botkyrka Kommun',       region:'Stockholm',  nuts:'SE110', cpv:'60100000', varde:980000,  dead: fwd(54), pub: ago(12), rel:71, co2:0 },
    ];
    for (const t of TENDERS) {
      insUpp.run(
        CID, t.eid, 'TED', t.titel, t.kopare, t.region, t.nuts, t.cpv,
        t.varde, t.dead.slice(0,10), t.pub.slice(0,10),
        `Upphandling avser ${t.titel.toLowerCase()}. Anbud lämnas via Visma TendSign.`,
        `https://ted.europa.eu/udl?uri=TED:NOTICE:${t.eid}:TEXT:SV`,
        t.rel, t.co2, ago(5)
      );
      const row = db.prepare(`SELECT id FROM upphandlingar WHERE company_id=? AND external_id=?`).get(CID, t.eid);
      if (row) {
        const alreadyTracked = db.prepare(`SELECT 1 FROM demo_seeds WHERE table_name='upphandlingar' AND row_id=?`).get(row.id);
        if (!alreadyTracked) track('upphandlingar', row.id);
      }
    }

    // ── 12. Audit log — ~150 entries over 30 days ──────────────────────────────
    const insAudit = db.prepare(`
      INSERT INTO audit_log
        (company_id,user_id,user_name,entity_type,entity_id,action,after_value,ip_address,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const ACTIONS = [
      { et:'quote',   action:'create', note:'Ny offert skapad' },
      { et:'quote',   action:'update', note:'Pris justerat' },
      { et:'job',     action:'create', note:'Uppdrag skapat' },
      { et:'job',     action:'update', note:'Status ändrad till pågående' },
      { et:'invoice', action:'create', note:'Faktura skapad' },
      { et:'invoice', action:'update', note:'Faktura markerad betald' },
      { et:'fleet',   action:'update', note:'Fordonsinformation uppdaterad' },
      { et:'driver',  action:'update', note:'Förare uppdaterad' },
      { et:'settings',action:'update', note:'Företagsinformation ändrad' },
    ];
    const uNames = [ownerUser?.name ?? 'Admin', 'Maria Nilsson', 'Erik Ström'];
    const ips = ['192.168.1.12','192.168.1.15','10.0.0.4'];
    for (let i = 0; i < 150; i++) {
      const dBack = Math.round((i / 149) * 30);
      const act = pick(ACTIONS, i * 3 + 1);
      const entityId = String(quoteIds[i % quoteIds.length]);
      const auditId = insAudit.run(
        CID, userId, pick(uNames, i),
        act.et, entityId, act.action,
        JSON.stringify({ note: act.note }),
        pick(ips, i), ago(dBack)
      ).lastInsertRowid;
      track('audit_log', auditId);
    }

    // ── 13. Backhaul job pairs ─────────────────────────────────────────────────
    const insPair = db.prepare(`
      INSERT OR IGNORE INTO job_pairs (company_id,job_id_a,job_id_b,linked_at)
      VALUES (?,?,?,?)
    `);
    const pairCandidates = jobRecords.filter(j => j.status === 'planerad' || j.status === 'pågående');
    for (let i = 0; i + 1 < pairCandidates.length && i < 5; i += 2) {
      const a = pairCandidates[i];
      const b = pairCandidates[i+1];
      insPair.run(CID, a.jobId, b.jobId, ago(2));
      const row = db.prepare(`SELECT id FROM job_pairs WHERE company_id=? AND job_id_a=? AND job_id_b=?`).get(CID, a.jobId, b.jobId);
      if (row) {
        const alreadyTracked = db.prepare(`SELECT 1 FROM demo_seeds WHERE table_name='job_pairs' AND row_id=?`).get(row.id);
        if (!alreadyTracked) track('job_pairs', row.id);
      }
    }

  })(); // end transaction

  return { ok: true, seeded: db.prepare(`SELECT COUNT(*) AS n FROM demo_seeds`).get().n };
}
