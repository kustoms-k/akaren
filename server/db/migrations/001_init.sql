-- Åkaren add-on schema.
-- Conventions: money = integer öre ex VAT, weight = integer kg,
-- business dates = local 'YYYY-MM-DD' (Europe/Stockholm), timestamps = UTC ISO-8601.

CREATE TABLE companies (
  id                        INTEGER PRIMARY KEY,
  name                      TEXT    NOT NULL,
  org_nr                    TEXT,
  address                   TEXT,
  postnr                    TEXT,
  ort                       TEXT,
  phone                     TEXT,
  email                     TEXT,
  bankgiro                  TEXT,
  retention_months          INTEGER NOT NULL DEFAULT 36 CHECK (retention_months BETWEEN 1 AND 120),
  default_vat_mode          TEXT    NOT NULL DEFAULT 'normal' CHECK (default_vat_mode IN ('normal','omvand_bygg')),
  fortnox_status            TEXT    NOT NULL DEFAULT 'disconnected'
                            CHECK (fortnox_status IN ('disconnected','connected','reconnect_required')),
  fortnox_access_token_enc  TEXT,
  fortnox_refresh_token_enc TEXT,
  fortnox_token_expires_at  TEXT,
  fortnox_connected_at      TEXT,
  fortnox_last_sync_at      TEXT,
  created_at                TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Office users only. Drivers have no account; they use driver_links.
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE price_lists (
  id         INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name       TEXT    NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX ux_price_lists_default ON price_lists(company_id) WHERE is_default = 1;

-- Resolution: project list -> customer list -> company default.
-- Within a list the most specific row wins: (uppdragstyp + material) > uppdragstyp > generic.
CREATE TABLE price_list_items (
  id            INTEGER PRIMARY KEY,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  uppdragstyp   TEXT CHECK (uppdragstyp IN ('schakt','grus_leverans','kran','container','maskintransport','ovrigt')),
  material      TEXT,
  unit          TEXT    NOT NULL CHECK (unit IN ('lass','ton','timme','fast')),
  price_ore     INTEGER NOT NULL CHECK (price_ore >= 0),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_price_list_items_list ON price_list_items(price_list_id);

CREATE TABLE customers (
  id                  INTEGER PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  name                TEXT    NOT NULL,
  org_nr              TEXT,
  address             TEXT,
  postnr              TEXT,
  ort                 TEXT,
  email               TEXT,
  phone               TEXT,
  fortnox_customer_nr TEXT,
  price_list_id       INTEGER REFERENCES price_lists(id),
  vat_mode            TEXT CHECK (vat_mode IN ('normal','omvand_bygg')),  -- NULL = company default
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX ux_customers_orgnr   ON customers(company_id, org_nr)              WHERE org_nr IS NOT NULL;
CREATE UNIQUE INDEX ux_customers_fortnox ON customers(company_id, fortnox_customer_nr) WHERE fortnox_customer_nr IS NOT NULL;

CREATE TABLE projects (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  name          TEXT    NOT NULL,
  customer_ref  TEXT,
  address       TEXT,
  postnr        TEXT,
  ort           TEXT,
  miljozon      INTEGER NOT NULL DEFAULT 0 CHECK (miljozon BETWEEN 0 AND 3),
  kontaktperson TEXT,
  telefon       TEXT,
  price_list_id INTEGER REFERENCES price_lists(id),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_projects_customer ON projects(customer_id);

CREATE TABLE vehicles (
  id             INTEGER PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id),
  regnr          TEXT    NOT NULL,
  typ            TEXT    NOT NULL CHECK (typ IN ('tippbil','kranbil','lastvaxlare','trailer','ovrigt')),
  miljozonsklass INTEGER NOT NULL DEFAULT 0 CHECK (miljozonsklass BETWEEN 0 AND 3),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, regnr)
);

CREATE TABLE drivers (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  name          TEXT    NOT NULL,
  phone         TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  anonymized_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE photos (
  id                    TEXT    PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id),
  sha256                TEXT    NOT NULL,
  bytes                 INTEGER NOT NULL,
  width                 INTEGER,
  height                INTEGER,
  uploaded_by_driver_id INTEGER REFERENCES drivers(id),
  uploaded_by_user_id   INTEGER REFERENCES users(id),
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at            TEXT
);

CREATE TABLE ai_extractions (
  id              INTEGER PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  kind            TEXT    NOT NULL CHECK (kind IN ('order','vagsedel')),
  model           TEXT    NOT NULL,
  prompt_version  TEXT    NOT NULL,
  input_text      TEXT,
  input_photo_id  TEXT REFERENCES photos(id),
  fields_json     TEXT,
  confidence_json TEXT,
  raw_response    TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  latency_ms      INTEGER,
  error           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE order_intakes (
  id                   INTEGER PRIMARY KEY,
  company_id           INTEGER NOT NULL REFERENCES companies(id),
  raw_text             TEXT    NOT NULL,
  ai_extraction_id     INTEGER REFERENCES ai_extractions(id),
  status               TEXT    NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast','bekraftad','kasserad')),
  job_id               INTEGER REFERENCES jobs(id),
  created_by_user_id   INTEGER NOT NULL REFERENCES users(id),
  confirmed_by_user_id INTEGER REFERENCES users(id),
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  confirmed_at         TEXT
);

CREATE TABLE jobs (
  id                 INTEGER PRIMARY KEY,
  company_id         INTEGER NOT NULL REFERENCES companies(id),
  customer_id        INTEGER NOT NULL REFERENCES customers(id),
  project_id         INTEGER NOT NULL REFERENCES projects(id),
  order_intake_id    INTEGER REFERENCES order_intakes(id),
  uppdragstyp        TEXT    NOT NULL CHECK (uppdragstyp IN ('schakt','grus_leverans','kran','container','maskintransport','ovrigt')),
  material           TEXT,
  uppskattad_mangd   REAL,
  mangd_enhet        TEXT CHECK (mangd_enhet IN ('ton','m3','lass')),
  antal_lass         INTEGER,
  datum_fran         TEXT    NOT NULL,
  datum_till         TEXT,
  tid                TEXT,
  fran_text          TEXT,
  till_text          TEXT,
  instruktioner      TEXT,
  kontaktperson      TEXT,
  telefon            TEXT,
  status             TEXT    NOT NULL DEFAULT 'bekraftad' CHECK (status IN ('bekraftad','pagar','klar','avbruten')),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_jobs_project ON jobs(project_id);
CREATE INDEX ix_jobs_dates   ON jobs(company_id, datum_fran);

CREATE TABLE job_assignments (
  id                   INTEGER PRIMARY KEY,
  company_id           INTEGER NOT NULL REFERENCES companies(id),
  job_id               INTEGER NOT NULL REFERENCES jobs(id),
  vehicle_id           INTEGER NOT NULL REFERENCES vehicles(id),
  driver_id            INTEGER NOT NULL REFERENCES drivers(id),
  datum                TEXT    NOT NULL,
  miljozon_warning     INTEGER NOT NULL DEFAULT 0 CHECK (miljozon_warning IN (0,1)),
  miljozon_ack_user_id INTEGER REFERENCES users(id),
  sms_status           TEXT    NOT NULL DEFAULT 'ej_skickat'
                       CHECK (sms_status IN ('ej_skickat','skickat','simulerat','misslyckat')),
  sms_sent_at          TEXT,
  created_by_user_id   INTEGER NOT NULL REFERENCES users(id),
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cancelled_at         TEXT
);
CREATE INDEX ix_assignments_job    ON job_assignments(job_id);
CREATE INDEX ix_assignments_driver ON job_assignments(driver_id, datum);

-- Only the SHA-256 of the SMS token is stored. Scoped to exactly one driver.
CREATE TABLE driver_links (
  id           INTEGER PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id),
  driver_id    INTEGER NOT NULL REFERENCES drivers(id),
  token_hash   TEXT    NOT NULL UNIQUE,
  expires_at   TEXT    NOT NULL,
  revoked_at   TEXT,
  last_used_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_driver_links_driver ON driver_links(driver_id);

-- Lass identity (immutable). All lass data lives in lass_versions.
CREATE TABLE lass (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  job_id        INTEGER NOT NULL REFERENCES jobs(id),
  assignment_id INTEGER REFERENCES job_assignments(id),
  client_uuid   TEXT UNIQUE,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_lass_job ON lass(job_id);

CREATE TABLE lass_versions (
  id                    INTEGER PRIMARY KEY,
  lass_id               INTEGER NOT NULL REFERENCES lass(id),
  version               INTEGER NOT NULL CHECK (version >= 1),
  customer_id           INTEGER NOT NULL REFERENCES customers(id),
  project_id            INTEGER NOT NULL REFERENCES projects(id),
  vehicle_regnr         TEXT,
  driver_id             INTEGER REFERENCES drivers(id),
  datum                 TEXT    NOT NULL,
  tid                   TEXT,
  fran_text             TEXT,
  till_namn             TEXT,
  till_orgnr            TEXT,
  till_adress           TEXT,
  material              TEXT,
  avfallskod            TEXT CHECK (avfallskod IS NULL OR avfallskod GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  farligt_avfall        INTEGER NOT NULL DEFAULT 0 CHECK (farligt_avfall IN (0,1)),
  netto_kg              INTEGER CHECK (netto_kg IS NULL OR netto_kg > 0),
  vagsedel_nr           TEXT,
  photo_id              TEXT REFERENCES photos(id),
  ai_extraction_id      INTEGER REFERENCES ai_extractions(id),
  field_confidence_json TEXT,
  review_status         TEXT    NOT NULL CHECK (review_status IN ('behover_granskas','ok','granskad')),
  note                  TEXT,
  change_reason         TEXT CHECK (version = 1 OR (change_reason IS NOT NULL AND length(trim(change_reason)) > 0)),
  created_by_kind       TEXT    NOT NULL CHECK (created_by_kind IN ('driver','office','system')),
  created_by_user_id    INTEGER REFERENCES users(id),
  created_by_driver_id  INTEGER REFERENCES drivers(id),
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (lass_id, version)
);
CREATE INDEX ix_lass_versions_project ON lass_versions(project_id, datum);
CREATE INDEX ix_lass_versions_vagsedel ON lass_versions(vagsedel_nr);

-- Corrections append a new version; rows are never edited.
-- DELETE is reserved for the retention job, which writes to audit_log.
CREATE TRIGGER lass_versions_append_only BEFORE UPDATE ON lass_versions
BEGIN
  SELECT RAISE(ABORT, 'lass_versions is append-only');
END;

CREATE VIEW lass_current AS
SELECT v.*,
       l.company_id,
       l.job_id,
       l.assignment_id,
       l.created_at AS reported_at,
       CASE WHEN v.version > 1 THEN v.created_at END AS corrected_at
FROM lass l
JOIN lass_versions v ON v.lass_id = l.id
WHERE v.version = (SELECT MAX(v2.version) FROM lass_versions v2 WHERE v2.lass_id = l.id);

-- Hours for hourly-priced work (kran, maskintransport). Append-only like lass:
-- the newest row per (assignment_id, datum) is the current value.
CREATE TABLE time_entries (
  id                   INTEGER PRIMARY KEY,
  company_id           INTEGER NOT NULL REFERENCES companies(id),
  assignment_id        INTEGER NOT NULL REFERENCES job_assignments(id),
  datum                TEXT    NOT NULL,
  timmar               REAL    NOT NULL CHECK (timmar >= 0 AND timmar <= 24),
  note                 TEXT,
  change_reason        TEXT,
  created_by_kind      TEXT    NOT NULL CHECK (created_by_kind IN ('driver','office','system')),
  created_by_user_id   INTEGER REFERENCES users(id),
  created_by_driver_id INTEGER REFERENCES drivers(id),
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_time_entries_assignment ON time_entries(assignment_id, datum, id);

CREATE TRIGGER time_entries_append_only BEFORE UPDATE ON time_entries
BEGIN
  SELECT RAISE(ABORT, 'time_entries is append-only');
END;

-- Fakturaunderlag. A lass (or an assignment-day of hours, or a fixed-price job)
-- can be on at most one live invoice line, so nothing is invoiced twice.
-- A failed or voided batch deletes its lines; the snapshot stays on the batch.
CREATE TABLE invoice_batches (
  id                  INTEGER PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  iso_week            TEXT    NOT NULL,
  customer_id         INTEGER NOT NULL REFERENCES customers(id),
  project_id          INTEGER REFERENCES projects(id),
  kind                TEXT    NOT NULL CHECK (kind IN ('fortnox','manuell')),
  status              TEXT    NOT NULL CHECK (status IN ('pending','skapad','misslyckad','makulerad')),
  external_ref        TEXT    NOT NULL UNIQUE,
  fortnox_document_nr TEXT,
  total_ore           INTEGER NOT NULL,
  vat_mode            TEXT    NOT NULL CHECK (vat_mode IN ('normal','omvand_bygg')),
  lines_snapshot_json TEXT    NOT NULL,
  error               TEXT,
  created_by_user_id  INTEGER NOT NULL REFERENCES users(id),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE invoice_lines (
  id            INTEGER PRIMARY KEY,
  batch_id      INTEGER NOT NULL REFERENCES invoice_batches(id) ON DELETE CASCADE,
  lass_id       INTEGER REFERENCES lass(id),
  lass_version  INTEGER,
  assignment_id INTEGER REFERENCES job_assignments(id),
  datum         TEXT,
  job_id        INTEGER REFERENCES jobs(id),
  description   TEXT    NOT NULL,
  quantity      REAL    NOT NULL,
  unit          TEXT    NOT NULL,
  price_ore     INTEGER NOT NULL,
  amount_ore    INTEGER NOT NULL,
  CHECK ((lass_id IS NOT NULL) + (assignment_id IS NOT NULL) + (job_id IS NOT NULL AND lass_id IS NULL AND assignment_id IS NULL) = 1)
);
CREATE UNIQUE INDEX ux_invoice_lines_lass  ON invoice_lines(lass_id)               WHERE lass_id IS NOT NULL;
CREATE UNIQUE INDEX ux_invoice_lines_hours ON invoice_lines(assignment_id, datum)  WHERE assignment_id IS NOT NULL;
CREATE UNIQUE INDEX ux_invoice_lines_fixed ON invoice_lines(job_id)                WHERE lass_id IS NULL AND assignment_id IS NULL;

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id),
  actor_kind  TEXT    NOT NULL CHECK (actor_kind IN ('office','driver','system')),
  actor_id    INTEGER,
  entity      TEXT    NOT NULL,
  entity_id   TEXT,
  action      TEXT    NOT NULL,
  before_json TEXT,
  after_json  TEXT,
  ip          TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_audit_entity ON audit_log(company_id, entity, entity_id);
