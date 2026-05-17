import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'kemoffs.db');

const db = new DatabaseSync(DB_PATH);

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
    last_login    TEXT
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
];

// Backfill: companies created before the onboarding feature launch are already set up
try {
  db.exec(`UPDATE companies SET onboarding_completed_at = datetime('now') WHERE onboarding_completed_at IS NULL AND created_at < '2026-05-17'`);
} catch { /* ignore */ }

for (const sql of migrations) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

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
    INSERT INTO users (company_id, name, email, password_hash, role)
    VALUES (1, 'Admin', 'admin@kemoffs.se', ?, 'owner')
  `).run(hash);
  console.log('Seeded default admin user: admin@kemoffs.se / admin123');
}

// ── Seed 6 mock drivers (idempotent, uses company_id = 1) ────────────────────
const driverCount = db.prepare('SELECT COUNT(*) AS n FROM drivers WHERE company_id = 1').get();
if (driverCount.n === 0) {
  const ins = db.prepare(
    `INSERT INTO drivers (company_id, name, phone, truck_id) VALUES (1, ?, ?, ?)`
  );
  [
    ['Lars Eriksson',   '+46701234001', 'KEM-01'],
    ['Anna Lindström',  '+46701234002', 'KEM-02'],
    ['Björn Hansson',   '+46701234003', 'KEM-03'],
    ['Maria Johansson', '+46701234004', 'KEM-04'],
    ['Stefan Nilsson',  '+46701234005', 'KEM-05'],
    ['Karin Persson',   '+46701234006', 'KEM-06'],
  ].forEach(([name, phone, truck_id]) => ins.run(name, phone, truck_id));
  console.log('Seeded 6 mock drivers for company 1.');
}

export default db;
