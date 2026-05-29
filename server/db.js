import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'kemoffs.db');

let db;
try {
  db = new Database(DB_PATH);
  console.log('Database initialized')
} catch (err) {
  console.error('Database error:', err.message)
  process.exit(1)
}

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ── Core tables ───────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    org_nr        TEXT,
    address       TEXT,
    phone         TEXT,
    email         TEXT,
    brand_color   TEXT    NOT NULL DEFAULT '#c9a84c',
    logo_url      TEXT,
    fortnox_token TEXT,
    bankgiro      TEXT,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
    active        INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'dispatcher',
    last_login    TEXT,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id),
    inquiry_text    TEXT,
    lasttyp         TEXT,
    upphämtning     TEXT,
    leverans        TEXT,
    datum           TEXT,
    fordon_id       TEXT,
    avstand_km      REAL,
    totalpris_sek   REAL,
    lez_varning     INTEGER,
    tillstånd_krävs INTEGER,
    noteringar      TEXT,
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id),
    quote_id   INTEGER,
    status     TEXT DEFAULT 'planerad',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fuel_price_cache (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    price_per_litre REAL    NOT NULL,
    source          TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weather_cache (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    temp_c       REAL    NOT NULL,
    weather_code INTEGER NOT NULL,
    condition    TEXT    NOT NULL,
    condition_sv TEXT    NOT NULL,
    is_winter    INTEGER NOT NULL DEFAULT 0,
    updated_at   TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id     INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id),
    name           TEXT    NOT NULL,
    lasttyp        TEXT,
    upphämtning    TEXT,
    leverans       TEXT,
    fordon_id      TEXT,
    base_price_sek REAL,
    created_at     TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id),
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    truck_id   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quote_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id   INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    sender     TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    created_at TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS counter_offers (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id           INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    proposed_price_sek REAL    NOT NULL,
    note               TEXT,
    status             TEXT    NOT NULL DEFAULT 'pending',
    dispatcher_note    TEXT,
    revised_price_sek  REAL,
    created_at         TEXT    DEFAULT CURRENT_TIMESTAMP,
    responded_at       TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id   INTEGER NOT NULL REFERENCES companies(id),
    user_id      INTEGER REFERENCES users(id),
    entity_type  TEXT    NOT NULL,
    entity_id    TEXT,
    action       TEXT    NOT NULL,
    before_value TEXT,
    after_value  TEXT,
    ip_address   TEXT,
    created_at   TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_extractions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id            INTEGER NOT NULL REFERENCES companies(id),
    quote_id              INTEGER REFERENCES quotes(id),
    raw_inquiry           TEXT,
    system_prompt_version TEXT,
    model_used            TEXT,
    raw_response          TEXT,
    extracted_fields      TEXT,
    confidence_scores     TEXT,
    human_overrides       TEXT,
    created_at            TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id           INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    fortnox_customer_nr  TEXT    NOT NULL,
    name                 TEXT,
    address              TEXT,
    zip_code             TEXT,
    city                 TEXT,
    phone                TEXT,
    email                TEXT,
    org_nr               TEXT,
    synced_at            TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, fortnox_customer_nr)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    job_id           INTEGER REFERENCES jobs(id),
    faktura_nr       TEXT    NOT NULL,
    customer_name    TEXT,
    customer_org_nr  TEXT,
    customer_address TEXT,
    customer_email   TEXT,
    line_items       TEXT,
    subtotal         REAL,
    vat              REAL,
    total            REAL,
    due_date         TEXT,
    status           TEXT NOT NULL DEFAULT 'utestaende',
    fortnox_invoice_nr TEXT,
    created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, faktura_nr)
  );

  CREATE TABLE IF NOT EXISTS pricing_insights (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    insight_type TEXT    NOT NULL,
    insight_data TEXT,
    confidence   REAL    NOT NULL DEFAULT 1.0,
    created_at   TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, insight_type)
  );

  CREATE TABLE IF NOT EXISTS backups (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id   INTEGER REFERENCES companies(id),  -- NULL = full-db backup
    backup_type  TEXT    NOT NULL DEFAULT 'daily',  -- daily | monthly
    s3_key       TEXT,
    size_bytes   INTEGER,
    encrypted    INTEGER NOT NULL DEFAULT 1,
    status       TEXT    NOT NULL DEFAULT 'ok',     -- ok | failed
    error        TEXT,
    created_at   TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS deletion_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER NOT NULL REFERENCES companies(id),
    requested_by    INTEGER NOT NULL REFERENCES users(id),
    status          TEXT    NOT NULL DEFAULT 'pending',  -- pending | cancelled | executed
    hard_delete_at  TEXT    NOT NULL,
    executed_at     TEXT,
    created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dpa_acceptances (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    dpa_version TEXT    NOT NULL DEFAULT '2026-05-v1',
    ip_address  TEXT,
    accepted_at TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, dpa_version)
  );

  CREATE TABLE IF NOT EXISTS restore_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id  INTEGER NOT NULL,
    backup_id   INTEGER NOT NULL,
    token       TEXT    NOT NULL,
    expires_at  TEXT    NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customer_portals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_name   TEXT    NOT NULL,
    customer_phone  TEXT,
    customer_email  TEXT,
    token           TEXT    NOT NULL UNIQUE,
    notes           TEXT,
    created_at      TEXT    DEFAULT CURRENT_TIMESTAMP,
    last_seen_at    TEXT
  );

  CREATE TABLE IF NOT EXISTS portal_messages (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id         INTEGER NOT NULL REFERENCES companies(id),
    customer_portal_id INTEGER NOT NULL REFERENCES customer_portals(id) ON DELETE CASCADE,
    direction          TEXT    NOT NULL CHECK(direction IN ('in', 'out')),
    sender_name        TEXT,
    body               TEXT    NOT NULL,
    created_at         TEXT    DEFAULT CURRENT_TIMESTAMP,
    read_at            TEXT
  );

  CREATE TABLE IF NOT EXISTS portal_inquiries (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id         INTEGER NOT NULL REFERENCES companies(id),
    customer_portal_id INTEGER NOT NULL REFERENCES customer_portals(id) ON DELETE CASCADE,
    body               TEXT    NOT NULL,
    created_at         TEXT    DEFAULT CURRENT_TIMESTAMP,
    quote_id           INTEGER REFERENCES quotes(id)
  );

  CREATE TABLE IF NOT EXISTS portal_activity_log (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_portal_id INTEGER NOT NULL REFERENCES customer_portals(id) ON DELETE CASCADE,
    company_id         INTEGER NOT NULL,
    event              TEXT    NOT NULL,
    meta               TEXT,
    created_at         TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS road_alerts_cache (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    data       TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_fleet (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    ext_id          TEXT    NOT NULL,
    reg             TEXT,
    namn            TEXT    NOT NULL,
    lasttyp         TEXT,
    typ             TEXT    NOT NULL,
    max_last_kg     INTEGER,
    volym_m3        REAL,
    lez_godkand     INTEGER NOT NULL DEFAULT 0,
    euro_klass      INTEGER,
    timkostnad_sek  REAL    NOT NULL DEFAULT 750,
    tillstand       TEXT,
    priskm_sek      REAL    NOT NULL DEFAULT 18,
    startavgift_sek REAL    NOT NULL DEFAULT 500,
    beskrivning     TEXT,
    created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS driver_hours (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    driver_id       INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    job_id          INTEGER REFERENCES jobs(id),
    date            TEXT    NOT NULL,
    driving_minutes INTEGER NOT NULL DEFAULT 0,
    work_minutes    INTEGER NOT NULL DEFAULT 0,
    rest_minutes    INTEGER NOT NULL DEFAULT 0,
    source          TEXT    NOT NULL DEFAULT 'manual',
    created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS job_pairs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    job_id_a   INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    job_id_b   INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    linked_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, job_id_a, job_id_b)
  );

  CREATE TABLE IF NOT EXISTS upphandlingar (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id           INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    external_id          TEXT    NOT NULL,
    source               TEXT    NOT NULL DEFAULT 'TED',
    titel                TEXT    NOT NULL,
    kopare               TEXT,
    region               TEXT,
    nuts_kod             TEXT,
    cpv_koder            TEXT,
    estimerat_varde_sek  INTEGER,
    valuta               TEXT    NOT NULL DEFAULT 'SEK',
    deadline             TEXT,
    publiceringsdatum    TEXT,
    beskrivning          TEXT,
    url                  TEXT,
    relevans_score       INTEGER NOT NULL DEFAULT 50,
    flotta_kan_hantera   INTEGER NOT NULL DEFAULT 1,
    flotta_orsak         TEXT,
    co2_fordel           INTEGER NOT NULL DEFAULT 0,
    dismissed            INTEGER NOT NULL DEFAULT 0,
    hamtad_at            TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, external_id)
  );

  CREATE TABLE IF NOT EXISTS upphandling_watches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    upphandling_id  INTEGER NOT NULL REFERENCES upphandlingar(id) ON DELETE CASCADE,
    skapad_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, upphandling_id)
  );

  CREATE TABLE IF NOT EXISTS fuel_cards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    card_number   TEXT    NOT NULL,
    vehicle_id    INTEGER REFERENCES company_fleet(id),
    provider      TEXT,
    holder_name   TEXT,
    aktiv         INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, card_number)
  );

  CREATE TABLE IF NOT EXISTS fuel_imports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    filename      TEXT    NOT NULL,
    provider      TEXT,
    row_count     INTEGER NOT NULL DEFAULT 0,
    matched_count INTEGER NOT NULL DEFAULT 0,
    imported_at   TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fuel_transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    import_id        INTEGER REFERENCES fuel_imports(id) ON DELETE SET NULL,
    card_number      TEXT,
    vehicle_id       INTEGER REFERENCES company_fleet(id),
    transaction_date TEXT    NOT NULL,
    station_name     TEXT,
    fuel_type        TEXT,
    litres           REAL,
    amount_sek       REAL,
    price_per_litre  REAL,
    job_id           INTEGER REFERENCES jobs(id),
    reconciled_at    TEXT,
    created_at       TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS partner_companies (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    partner_name  TEXT    NOT NULL,
    org_nr        TEXT,
    contact_name  TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    notes         TEXT,
    aktiv         INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, partner_name)
  );

  CREATE TABLE IF NOT EXISTS job_referrals (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id                  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    partner_company_id          INTEGER NOT NULL REFERENCES partner_companies(id) ON DELETE CASCADE,
    quote_id                    INTEGER REFERENCES quotes(id),
    riktning                    TEXT    NOT NULL CHECK(riktning IN ('ut', 'in')),
    lasttyp                     TEXT,
    upphämtning                 TEXT,
    leverans                    TEXT,
    datum                       TEXT,
    overenskommet_totalpris_sek REAL,
    formedlingsavgift_pct       REAL    NOT NULL DEFAULT 10,
    partner_pris_sek            REAL,
    status                      TEXT    NOT NULL DEFAULT 'föreslagen',
    noteringar                  TEXT,
    created_at                  TEXT    DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vehicle_maintenance (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    vehicle_id          TEXT    NOT NULL,
    besiktning_datum    TEXT,
    forsakring_datum    TEXT,
    adr_datum           TEXT,
    service_datum       TEXT,
    service_km          INTEGER,
    current_km          INTEGER,
    sommar_dack_datum   TEXT,
    vinter_dack_datum   TEXT,
    updated_at          TEXT    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, vehicle_id)
  );

  CREATE TABLE IF NOT EXISTS maintenance_costs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    vehicle_id      TEXT    NOT NULL,
    typ             TEXT    NOT NULL,
    beskrivning     TEXT,
    belopp_sek      REAL    NOT NULL,
    datum           TEXT    NOT NULL,
    km_vid_service  INTEGER,
    created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS maintenance_alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    vehicle_id  TEXT    NOT NULL,
    alert_type  TEXT    NOT NULL,
    days_before INTEGER NOT NULL,
    sent_at     TEXT    NOT NULL,
    UNIQUE(company_id, vehicle_id, alert_type, days_before)
  );
`);

// ── Safe column migrations (pre-existing databases) ───────────────────────────
// Each is silently ignored if the column already exists.

const migrations = [
  `ALTER TABLE quotes    ADD COLUMN token               TEXT`,
  `ALTER TABLE quotes    ADD COLUMN status              TEXT DEFAULT 'väntande'`,
  `ALTER TABLE quotes    ADD COLUMN accepted_at         TEXT`,
  `ALTER TABLE quotes    ADD COLUMN company_id          INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE jobs      ADD COLUMN faktura_nr          TEXT`,
  `ALTER TABLE jobs      ADD COLUMN company_id          INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE jobs      ADD COLUMN fortnox_invoice_nr  TEXT`,
  `ALTER TABLE jobs      ADD COLUMN customer_id         INTEGER`,
  `ALTER TABLE templates ADD COLUMN company_id          INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE drivers   ADD COLUMN company_id          INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE companies ADD COLUMN fortnox_refresh_token    TEXT`,
  `ALTER TABLE companies ADD COLUMN fortnox_token_expires_at TEXT`,
  `ALTER TABLE companies ADD COLUMN fortnox_connected_at     TEXT`,
  `ALTER TABLE companies ADD COLUMN fortnox_last_sync        TEXT`,
  `ALTER TABLE companies ADD COLUMN faktura_counter          INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE quotes    ADD COLUMN bränsle_kostnad          REAL`,
  `ALTER TABLE quotes    ADD COLUMN arbetstid_kostnad        REAL`,
  `ALTER TABLE quotes    ADD COLUMN arbetstid_timmar         REAL`,
  `ALTER TABLE quotes    ADD COLUMN confidence_score         REAL`,
  `ALTER TABLE quotes    ADD COLUMN review_status            TEXT`,
  `ALTER TABLE companies ADD COLUMN dpa_accepted_at          TEXT`,
  `ALTER TABLE companies ADD COLUMN deleted_at               TEXT`,
  `ALTER TABLE quotes    ADD COLUMN customer_portal_id       INTEGER`,
  `ALTER TABLE quotes    ADD COLUMN customer_name            TEXT`,
  `ALTER TABLE quotes    ADD COLUMN customer_phone           TEXT`,
  `ALTER TABLE quotes    ADD COLUMN customer_email           TEXT`,
  `ALTER TABLE companies ADD COLUMN active                   INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE companies ADD COLUMN subscription_renews_at   TEXT`,
  `ALTER TABLE companies ADD COLUMN onboarding_completed_at  TEXT`,
  `ALTER TABLE companies ADD COLUMN pricing_config           TEXT`,
  `ALTER TABLE users     ADD COLUMN tour_dismissed_at        TEXT`,
  `ALTER TABLE users     ADD COLUMN tos_accepted_at          TEXT`,
  `ALTER TABLE users     ADD COLUMN tos_version              TEXT`,
  `ALTER TABLE companies ADD COLUMN stripe_customer_id         TEXT`,
  `ALTER TABLE companies ADD COLUMN stripe_subscription_id     TEXT`,
  `ALTER TABLE companies ADD COLUMN stripe_subscription_status TEXT NOT NULL DEFAULT 'none'`,
  // RBAC columns
  `ALTER TABLE users ADD COLUMN active               INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN bankid_personnummer  TEXT`,
  `ALTER TABLE users ADD COLUMN invite_token         TEXT`,
  `ALTER TABLE users ADD COLUMN invite_expires_at    TEXT`,
  `ALTER TABLE users ADD COLUMN driver_id            INTEGER REFERENCES drivers(id)`,
  // Audit trail enrichment
  `ALTER TABLE audit_log ADD COLUMN user_name TEXT`,
  // User created_at — was missing from original schema; existing rows get NULL
  `ALTER TABLE users ADD COLUMN created_at TEXT`,
  // Vehicle fuel consumption for route cost calculation
  `ALTER TABLE company_fleet ADD COLUMN forbrukning_l_per_km REAL`,
  // Actual reconciled fuel cost per job (set during fuel card reconciliation)
  `ALTER TABLE quotes ADD COLUMN actual_bränsle_sek REAL`,
];

// Backfill: companies created before the onboarding feature launch are already set up
try {
  db.exec(`UPDATE companies SET onboarding_completed_at = datetime('now') WHERE onboarding_completed_at IS NULL AND created_at < '2026-05-17'`);
} catch { /* ignore */ }

for (const sql of migrations) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

// Rename legacy roles to Swedish names (idempotent)
try { db.exec(`UPDATE users SET role = 'agare'        WHERE role = 'owner'`);      } catch {}
try { db.exec(`UPDATE users SET role = 'trafikledare' WHERE role = 'dispatcher'`); } catch {}
// Ensure all existing users are active
try { db.exec(`UPDATE users SET active = 1 WHERE active IS NULL`); } catch {}

// ── Seed default company (id = 1) ─────────────────────────────────────────────
const companyCount = db.prepare('SELECT COUNT(*) AS n FROM companies').get();
if (companyCount.n === 0) {
  db.prepare(`
    INSERT INTO companies (id, name, org_nr, address, phone, email, brand_color, bankgiro, active)
    VALUES (1, 'Kemoffs Åkeri och Entreprenad AB', '556789-0123',
            'Industrivägen 12, 117 43 Stockholm', '08-123 456 78',
            'info@kemoffs.se', '#c9a84c', '123-4567', 1)
  `).run();
  console.log('Seeded default company (id=1).');
}

// ── Seed default admin user ────────────────────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (userCount.n === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (company_id, name, email, password_hash, role, active)
    VALUES (1, 'Admin', 'admin@kemoffs.se', ?, 'agare', 1)
  `).run(hash);
  console.log('Seeded default admin user: admin@kemoffs.se / admin123');
}

// ── Seed vehicle maintenance records for default company ─────────────────────
const maintCount = db.prepare('SELECT COUNT(*) AS n FROM vehicle_maintenance WHERE company_id = 1').get();
if (maintCount.n === 0) {
  const insMaint = db.prepare(`
    INSERT INTO vehicle_maintenance
      (company_id, vehicle_id, besiktning_datum, forsakring_datum, adr_datum,
       service_datum, service_km, current_km, sommar_dack_datum, vinter_dack_datum)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    // id, besiktning, försäkring, ADR, service_datum, service_km, current_km, sommar_däck, vinter_däck
    ['KEM-01', '2026-11-15', '2027-01-01', '2026-07-20', '2026-08-10', 250000, 236400, '2026-04-10', '2025-11-14'],
    ['KEM-02', '2026-12-01', '2027-01-01', '2026-06-10', '2026-09-01', 200000, 191200, '2026-04-10', '2025-11-14'],
    ['KEM-03', '2026-06-15', '2027-01-01', null,         '2026-07-20', 130000, 122800, '2026-04-10', '2025-11-14'],
    ['KEM-04', '2027-03-01', '2027-01-01', null,         '2026-11-01', 110000,  97300, '2026-04-10', '2025-11-14'],
    ['KEM-05', '2026-06-05', '2027-01-01', '2026-06-25', '2026-08-15', 190000, 181500, '2026-04-10', '2025-11-14'],
    ['KEM-06', '2026-12-15', '2027-01-01', '2027-02-01', '2026-10-01',  75000,  62100, '2026-04-10', '2025-11-14'],
  ].forEach(([id, b, f, a, sd, sk, ck, so, vi]) => insMaint.run(id, b, f, a, sd, sk, ck, so, vi));
  console.log('Seeded vehicle_maintenance for company 1.');
}

// ── Seed sample maintenance costs for default company ─────────────────────────
const costCount = db.prepare('SELECT COUNT(*) AS n FROM maintenance_costs WHERE company_id = 1').get();
if (costCount.n === 0) {
  const insCost = db.prepare(`
    INSERT INTO maintenance_costs (company_id, vehicle_id, typ, beskrivning, belopp_sek, datum, km_vid_service)
    VALUES (1, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['KEM-01', 'service',     'Periodisk service + oljebyte',          12400,  '2026-01-15', 220000],
    ['KEM-01', 'reparation',  'Bromsklossar fram',                      8750,  '2026-03-22', 229000],
    ['KEM-02', 'service',     'Periodisk service',                     11200,  '2026-02-10', 178000],
    ['KEM-02', 'dack',        'Vinterhjul montering',                   3200,  '2025-11-14',  null  ],
    ['KEM-03', 'service',     'Periodisk service + filter',            10800,  '2025-12-05', 108000],
    ['KEM-03', 'reparation',  'Byte av kylarslang',                     2100,  '2026-04-01', 118000],
    ['KEM-04', 'service',     'Periodisk service',                      9600,  '2026-01-20',  85000],
    ['KEM-05', 'service',     'Stor service 150 000 km',               18500,  '2025-11-30', 165000],
    ['KEM-05', 'reparation',  'Turbo reparation',                      24800,  '2026-03-15', 175000],
    ['KEM-06', 'service',     'Periodisk service',                      9200,  '2026-02-28',  54000],
    ['KEM-06', 'besiktning',  'Kontrollbesiktning Bilprovningen',        650,  '2026-02-28',  null  ],
  ].forEach(([vid, typ, besk, belopp, datum, km]) => insCost.run(vid, typ, besk, belopp, datum, km));
  console.log('Seeded maintenance_costs for company 1.');
}

// ── Seed 6 drivers for default company (realistic Swedish names) ─────────────
const driverCount = db.prepare('SELECT COUNT(*) AS n FROM drivers WHERE company_id = 1').get();
if (driverCount.n === 0) {
  const ins = db.prepare(
    `INSERT INTO drivers (company_id, name, phone, truck_id) VALUES (1, ?, ?, ?)`
  );
  [
    ['Anders Bergström',  '+46701234001', 'KEM-01'],  // Volvo FH 540 Kranbil
    ['Johan Lindqvist',   '+46701234002', 'KEM-02'],  // Scania R 500 Lastväxlare
    ['Erik Nordin',       '+46701234003', 'KEM-03'],  // Volvo FM 460 Flakbil
    ['Maria Sundberg',    '+46701234004', 'KEM-04'],  // Scania G 410 Boggi
    ['Lars Karlsson',     '+46701234005', 'KEM-05'],  // Mercedes Actros Truck+Släp
    ['Karin Persson',     '+46701234006', 'KEM-06'],  // MAN TGX Containerbil
  ].forEach(([name, phone, truck_id]) => ins.run(name, phone, truck_id));
  console.log('Seeded 6 drivers for company 1.');
}

export default db;
