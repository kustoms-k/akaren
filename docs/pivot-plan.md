# Åkaren pivot plan (Phase 1 audit)

Status: **approved 2026-10-03 with all recommendations (D1–D16)**. Phases 2–3 are done; Phase 4 is next.
Audit date: 2026-10-03, against `main` @ `fb5d389` (tagged `pre-pivot-archive`).

## Progress log

**Phase 2 (done).** Archive tag; removals per §2.1–2.2; new server structure; `001_init.sql`; Teståkeriet seed; master-data API and pages (Kunder & projekt, Fordon & förare, Inställningar with Fortnox connect/reconnect); 56 server tests. Deviations from the original plan:
- `time_entries` (D3) went into `001_init.sql` rather than a separate migration, since nothing had been applied yet.
- The price-list API and UI move to Phase 6. The seed writes price lists directly.
- `client/src/utils/generatePdf.js` (the old offert PDF) is deleted rather than kept. Phase 5 can lift its jsPDF layout helpers from the archive tag. `jspdf` and `dexie` stay as dependencies for Phases 5 and 4.
- The seeded lass have no photos. Phase 4 adds synthetic vågsedel images to the seed once `sharp` is in.
- Vite reads `server/.env` itself; there is one env file for the whole app.

**Phase 3 (done).** AI order intake: `services/ai.js` (structured outputs, cost logging, monthly budget), `lib/orderExtraction.js` (schema, prompt, validators that only downgrade confidence), `lib/match.js` (org nr, project ref in text, email domain, address and fuzzy name), intake API with a server-enforced review gate and a duplicate guard, read-only jobs API, and the Ny beställning / Granska / Uppdrag pages. 100 tests pass. Verified in headless Chrome through the real SDK against a local mock of the Messages API. Additions and deviations:
- **Spend cap** (`AI_MONTHLY_BUDGET_USD`, default 30): this answers the D10 cost question. Usage is shown under Inställningar.
- **Manual entry** (`POST /api/intake/manual`) uses the same review/confirm flow, so intake works without an API key.
- **No server-side refusal fallback:** SDK 0.96 has no `fallbacks` parameter. A `refusal` stop reason surfaces as a Swedish error with a manual-entry hint.
- **Migration `002_ai_cost_and_intake_review.sql`** adds the cost columns and `order_intakes.final_json` / `overrides_json`.
- **Not yet tested against the real API.** Needs `ANTHROPIC_API_KEY`; the first real orders should be spot-checked for prompt quality.

---

## 1. Current state

### 1.1 Architecture

| Layer | What's there |
|---|---|
| Runtime | Runs locally only. Node ≥20.19 (`.nvmrc` = 20). VS Code task "Start Åkaren" runs Vite (5173) and Express (3002) in parallel. Both already bind `0.0.0.0`. |
| Frontend | React 19 + Vite 8 + Tailwind 4 + `motion`. No router: `App.jsx` (2,945 lines) switches pages with `useState('home')`. `main.jsx` path-matches `/quote/:token` and `/portal/:token`. Full sv/en i18n (`translations.js`, 3,835 lines). Offline cache through Dexie (`db/dexie.js`, `db/sync.js`, `SyncContext`). PDFs are generated client-side with jsPDF. Design tokens live in `index.css` (light, Geist, `--accent: #2d3340`). |
| Backend | Express 4. `index.js` mounts 32 routers. `db.js` (637 lines) creates every table at import time, runs `ALTER TABLE` migrations in try/catch, and seeds a default company, an admin user (`admin@kemoffs.se` / `admin123`), drivers and maintenance rows. Cron jobs: pricing insights (daily), TED tender fetch, maintenance alerts, nightly backup. |
| Database | SQLite (better-sqlite3, WAL) at `server/data/kemoffs.db`. **The DB file and its WAL are committed to git.** It holds demo data only: 2 companies, 85 quotes, 47 jobs, 18 customers with `DEMO-` numbers. No Fortnox or Stripe connection. |
| Auth | JWT (24 h) in `localStorage`. 5 roles: `agare`, `trafikledare`, `ekonomi`, `forare`, `revisor`. BankID login (test cert). Invite-by-email flow. |
| Tests | **None.** No test runner is configured. |
| Repo hygiene | **`server/node_modules` is tracked (5,813 files).** `server/backups/` holds an unencrypted DB copy (untracked). No secrets in git history (checked; the `sk-ant-...` hit is a placeholder). |

### 1.2 Current data model (36 tables)

Core: `companies`, `users`, `customers` (Fortnox-synced; `fortnox_customer_nr NOT NULL`), `quotes`, `jobs` (only `quote_id` + status; all job data lives on `quotes`), `invoices`, `drivers` (`truck_id` text), `company_fleet`, `templates`, `audit_log`, `ai_extractions` (empty, never written).
Feature tables: `driver_hours`, `job_pairs` (backhaul), `upphandlingar`, `upphandling_watches`, `pricing_insights`, `fuel_cards`, `fuel_imports`, `fuel_transactions`, `partner_companies`, `job_referrals`, `vehicle_maintenance`, `maintenance_costs`, `maintenance_alerts`, `customer_portals`, `portal_messages`, `portal_inquiries`, `portal_activity_log`, `quote_messages`, `counter_offers`, `backups`, `deletion_requests`, `dpa_acceptances`, `restore_tokens`, `fuel_price_cache`, `weather_cache`, `road_alerts_cache`.

There are three separate "customer" concepts (`customers`, `customer_portals`, `quotes.customer_name`), and none of them works without Fortnox.

### 1.3 Integrations as found

| Integration | Where | Findings |
|---|---|---|
| Anthropic | `routes/analyse.js` | Hardcoded `claude-sonnet-4-6`. Forced `tool_choice`. A single `confidence` for the whole extraction, not per field. The prompt says *"Gissa rimliga värden om specifik information saknas"*, which is the opposite of human-in-the-loop. **On API error it silently returns mock data (`mock_fallback`).** |
| 46elks | `sms.js` | Simulation mode when credentials are missing (good). **Sender `'Åkaren'` is invalid:** 46elks alphanumeric senders must be ≤11 characters, A–Z a–z 0–9 only. |
| Fortnox | `services/fortnox.js` | OAuth with tokens encrypted by AES-256-GCM (good). Problems: (a) refresh tokens rotate on every use, and two parallel requests can both refresh, so the second invalidates the first and the connection dies. (b) An expired refresh token (45 days unused) throws a generic error with no reconnect state. (c) Invoice rows send `Quantity`, but Fortnox invoice rows use `DeliveredQuantity`, so quantities are probably ignored. Verify against the sandbox. (d) Prices are divided by 1.25 on the assumption that they include VAT. |
| OpenRouteService / OSRM / Nominatim / Trafikverket / TED / open-meteo / fuel-price scraping | various | All are removed by this plan. |

---

## 2. Removal inventory

`git tag pre-pivot-archive fb5d389` is created first. Everything below stays reachable through that tag.

### 2.1 Features the spec says to remove

| Feature | Server | Client | Tables / columns | What else depends on it |
|---|---|---|---|---|
| EU 561/2006 | `routes/driverHours.js` | `pages/Kortider.jsx` (already orphaned), `ComplianceWarningModal` in `App.jsx` | `driver_hours` | `routes/jobs.js` POST runs the compliance check and writes `driver_hours`. The seed writes rows too. |
| LEZ routing + ORS | `routes/route.js`, `routes/routeAdvisory.js`, `routes/distance.js`, `data/lez_zones.json`, `routes/backhaul.js` (route-based pairing) | `components/RouteMap.jsx`, `components/VehicleComparisonPanel.jsx`, `AccuracyInputsCard` and the auto-route `useEffect` in `App.jsx`, backhaul UI in `pages/Jobs.jsx` | `job_pairs`, `quotes.lez_varning`, `company_fleet.lez_godkand` | The analyse prompt lists LEZ zones. `leaflet` and `react-leaflet` exist only for this. |
| Pricing intelligence | `jobs/pricingInsights.js`, `routes/pricingInsights.js` | `components/PricingIntelligencePanel.jsx`, `syncPricingInsights` in `db/sync.js`, Dexie v2 store | `pricing_insights`, `companies.pricing_config` | `routes/quotes.js` imports `computeInsightsForCompany`. `index.js` schedules the job. `onboarding.js` writes `pricing_config`. |
| Tender matching | `jobs/tenderFetch.js`, `routes/upphandlingar.js` | `pages/Upphandlingar.jsx` (already orphaned) | `upphandlingar`, `upphandling_watches` | `index.js` scheduler. Scoring reads CO2 data. |
| Complex RBAC | Role constants in `middleware/auth.js`, `routes/users.js` (invites), `routes/auth.js /setup`, `routes/bankid.js` | `pages/SetupAccount.jsx`, `NAV_ROLES` in `App.jsx`, `DriverView` login path | `users.role/invite_token/invite_expires_at/driver_id/bankid_personnummer` | Every `requireRole(...)` in `index.js`. The `forare` branches in `jobs.js`. The `REVISOR` gate in `audit`. |

### 2.2 Features the spec doesn't mention (**decision D1**)

None of these belong to the three-thing product:

| Feature | Files |
|---|---|
| Offert flow + public quote page + counter-offers + quote email | `routes/quotes.js`, `routes/publicQuote.js`, `pages/PublicQuote.jsx`, `components/MessagePanel.jsx`, `utils/generatePdf.js` (keep its font/layout helpers), `routes/templates.js`, `mockAnalysis.js` |
| Customer portal | `routes/portal.js`, `routes/customers.js` (portals), `pages/CustomerPortal.jsx`, `pages/Customers.jsx` |
| Old invoices + payment reminders | `routes/invoices.js`, `utils/generateFaktura.js`, `utils/generatePaminelse.js`, `InvoicesTab` in `App.jsx` |
| Stripe subscriptions | `routes/stripe.js`, `middleware/requireSubscription.js`, `components/SubscriptionGate.jsx`, `SubscriptionPaused` |
| BankID | `routes/bankid.js`, `certs/` |
| CO2, Nätverk (subcontractors), Drivmedel (fuel cards), Underhåll (maintenance) | `routes/co2.js`, `routes/natverk.js`, `routes/drivmedel.js`, `routes/underhall.js`, `jobs/maintenanceAlerts.js`, `pages/Co2.jsx`, `pages/Natverk.jsx`, `pages/Drivmedel.jsx`, `pages/Underhall.jsx` |
| Profitability / statistics / revenue dashboard | `routes/profitability.js`, `routes/statistics.js`, `pages/Profitability.jsx`, `RevenueChart` + `HomePage` KPIs |
| Weather, road alerts, fuel price | `routes/weather.js`, `routes/roadAlerts.js`, `routes/fuelPrice.js` |
| Onboarding wizard + tour + demo seeding | `routes/onboarding.js`, `routes/demo.js`, `seed/demoData.js` (uses **real** company names and org numbers, e.g. NCC, Skanska, Peab), `pages/Onboarding.jsx`, `components/TourOverlay.jsx` |
| DPA/ToS generators, S3 restore flow | `routes/dataPrivacy.js` (to be rewritten, see §4.7), `utils/generateDpa.js`, `utils/generateTos.js`, `components/DpaModal.jsx` |
| English UI | `i18n/translations.js`, `context/LanguageContext.jsx` |
| Offline sync of the office app | `db/sync.js`, `context/SyncContext.jsx` (Dexie is kept only for the driver outbox) |
| Railway | `railway.json` (already deleted in the working tree), `server/start.js` |

**Recommendation:** remove all of it. The archive tag preserves it.

### 2.3 Dependencies

| Package | Action | Reason |
|---|---|---|
| server: `@aws-sdk/client-s3` | remove (or keep if D14 = S3) | backups |
| server: `stripe`, `qrcode`, `nodemailer`, `xlsx`, `dotenv` | remove | Stripe, BankID QR, invites/quote email, fuel-card import. `dotenv` duplicates `node --env-file`. |
| server: `multer`, `node-cron`, `helmet`, `cors`, `express-rate-limit`, `bcryptjs`, `jsonwebtoken`, `better-sqlite3`, `@anthropic-ai/sdk` | keep | |
| server: **add** `zod`, `sharp`, `vitest`, `supertest` | add | validation and structured outputs; image resize and EXIF strip; tests |
| client: `leaflet`, `react-leaflet`, `recharts`, `qrcode` | remove | |
| client: `dexie`, `dexie-react-hooks` | keep (driver outbox only) | |
| client: `jspdf`, `lucide-react`, `motion`, `tailwindcss` | keep | |

### 2.4 Env vars

Remove: `ORS_API_KEY`, `TRAFIKVERKET_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `SMTP_*`, `BANKID_*`, `BACKUP_ENCRYPTION_KEY` + `S3_*` (unless D14 = S3).

New and kept vars (all URLs come from env, with no hardcoded `localhost` outside `.env.example`):

```
# Server
HOST=0.0.0.0
PORT=3002
DATA_DIR=./data                       # akaren.db + photos/ + backups/
TZ=Europe/Stockholm
NODE_ENV=development

# URLs
APP_URL=http://localhost:5173         # office UI, used for the Fortnox redirect back
PUBLIC_BASE_URL=http://192.168.x.y:5173   # base for driver magic links (phone on the same Wi-Fi)
CORS_ORIGINS=                          # extra allowed origins, comma separated
VITE_API_TARGET=http://localhost:3002  # Vite dev proxy target (client)

# Auth
JWT_SECRET=                            # ≥32 chars, required (no fallback)
ENCRYPTION_KEY=                        # 64 hex chars, required (no JWT fallback)
DRIVER_LINK_MAX_DAYS=7

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5
ANTHROPIC_BASE_URL=                    # optional, test override

# 46elks
ELKS_USERNAME=
ELKS_PASSWORD=
ELKS_SENDER=Akaren                     # ≤11 chars, A–Z a–z 0–9
ELKS_API_BASE=https://api.46elks.com/a1

# Fortnox
FORTNOX_CLIENT_ID=
FORTNOX_CLIENT_SECRET=
FORTNOX_REDIRECT_URI=http://localhost:3002/api/fortnox/callback
FORTNOX_AUTH_BASE=https://apps.fortnox.se/oauth-v1
FORTNOX_API_BASE=https://api.fortnox.se/3

# Retention
RETENTION_MONTHS_DEFAULT=36
```

The external API base URLs are env-overridable so tests can point them at local mocks.

---

## 3. Target data model

Conventions: money is **integer öre ex VAT**, weight is **integer kg**, business dates are **local `YYYY-MM-DD` (Europe/Stockholm)**, and timestamps are **UTC ISO-8601**. DB enum values are ASCII snake_case Swedish domain terms; the UI maps them to Swedish labels.

Migrations become numbered files in `server/db/migrations/NNN_name.sql`, applied in order and tracked in `schema_migrations`. Applied files are never edited. The project starts on a **fresh `akaren.db`** (D9). `kemoffs.db` is untracked and left on disk.

```sql
-- 001_init.sql
CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);

CREATE TABLE companies (
  id                        INTEGER PRIMARY KEY,
  name                      TEXT NOT NULL,
  org_nr                    TEXT,
  address                   TEXT, postnr TEXT, ort TEXT,
  phone                     TEXT, email TEXT, bankgiro TEXT,
  retention_months          INTEGER NOT NULL DEFAULT 36 CHECK (retention_months BETWEEN 1 AND 120),
  default_vat_mode          TEXT NOT NULL DEFAULT 'normal' CHECK (default_vat_mode IN ('normal','omvand_bygg')),
  fortnox_status            TEXT NOT NULL DEFAULT 'disconnected'
                            CHECK (fortnox_status IN ('disconnected','connected','reconnect_required')),
  fortnox_access_token_enc  TEXT,
  fortnox_refresh_token_enc TEXT,
  fortnox_token_expires_at  TEXT,
  fortnox_connected_at      TEXT,
  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Office users only. Drivers have no account (see driver_links).
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE price_lists (
  id         INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX ux_price_lists_default ON price_lists(company_id) WHERE is_default = 1;

-- Resolution order: project list → customer list → company default.
-- Within a list, the most specific row wins: (uppdragstyp + material) > uppdragstyp > generic.
CREATE TABLE price_list_items (
  id            INTEGER PRIMARY KEY,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  uppdragstyp   TEXT CHECK (uppdragstyp IN ('schakt','grus_leverans','kran','container','maskintransport','ovrigt')),
  material      TEXT,
  unit          TEXT NOT NULL CHECK (unit IN ('lass','ton','timme','fast')),
  price_ore     INTEGER NOT NULL CHECK (price_ore >= 0),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE customers (
  id                  INTEGER PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  name                TEXT NOT NULL,
  org_nr              TEXT,                  -- normalised NNNNNN-NNNN
  address             TEXT, postnr TEXT, ort TEXT,
  email               TEXT, phone TEXT,
  fortnox_customer_nr TEXT,
  price_list_id       INTEGER REFERENCES price_lists(id),
  vat_mode            TEXT CHECK (vat_mode IN ('normal','omvand_bygg')),  -- NULL = company default
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX ux_customers_orgnr   ON customers(company_id, org_nr)              WHERE org_nr IS NOT NULL;
CREATE UNIQUE INDEX ux_customers_fortnox ON customers(company_id, fortnox_customer_nr) WHERE fortnox_customer_nr IS NOT NULL;

CREATE TABLE projects (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  name          TEXT NOT NULL,               -- projekt / arbetsplats
  customer_ref  TEXT,                        -- customer's project number, used as "Er referens" on the invoice
  address       TEXT, postnr TEXT, ort TEXT,
  miljozon      INTEGER NOT NULL DEFAULT 0 CHECK (miljozon BETWEEN 0 AND 3),  -- 0 = no zone
  kontaktperson TEXT, telefon TEXT,
  price_list_id INTEGER REFERENCES price_lists(id),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE vehicles (
  id             INTEGER PRIMARY KEY,
  company_id     INTEGER NOT NULL REFERENCES companies(id),
  regnr          TEXT NOT NULL,              -- uppercase, no spaces
  typ            TEXT NOT NULL CHECK (typ IN ('tippbil','kranbil','lastvaxlare','trailer','ovrigt')),
  miljozonsklass INTEGER NOT NULL DEFAULT 0 CHECK (miljozonsklass BETWEEN 0 AND 3),  -- strictest zone class it meets
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, regnr)
);

CREATE TABLE drivers (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,
  phone         TEXT,                        -- E.164; NULL after GDPR deletion
  active        INTEGER NOT NULL DEFAULT 1,
  anonymized_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE photos (
  id                    TEXT PRIMARY KEY,    -- 32 hex chars of crypto randomness; also the file name
  company_id            INTEGER NOT NULL REFERENCES companies(id),
  sha256                TEXT NOT NULL,
  bytes                 INTEGER NOT NULL,
  width                 INTEGER, height INTEGER,
  uploaded_by_driver_id INTEGER REFERENCES drivers(id),
  uploaded_by_user_id   INTEGER REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at            TEXT
);

-- Every model call is logged; there is no silent mock fallback.
CREATE TABLE ai_extractions (
  id              INTEGER PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  kind            TEXT NOT NULL CHECK (kind IN ('order','vagsedel')),
  model           TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  input_text      TEXT,
  input_photo_id  TEXT REFERENCES photos(id),
  fields_json     TEXT,                      -- parsed + validated values
  confidence_json TEXT,                      -- per field: hog | medel | lag | saknas
  raw_response    TEXT,
  input_tokens    INTEGER, output_tokens INTEGER, latency_ms INTEGER,
  error           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE order_intakes (
  id                   INTEGER PRIMARY KEY,
  company_id           INTEGER NOT NULL REFERENCES companies(id),
  raw_text             TEXT NOT NULL,
  ai_extraction_id     INTEGER REFERENCES ai_extractions(id),
  status               TEXT NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast','bekraftad','kasserad')),
  job_id               INTEGER REFERENCES jobs(id),
  created_by_user_id   INTEGER NOT NULL REFERENCES users(id),
  confirmed_by_user_id INTEGER REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  confirmed_at         TEXT
);

CREATE TABLE jobs (
  id                 INTEGER PRIMARY KEY,
  company_id         INTEGER NOT NULL REFERENCES companies(id),
  customer_id        INTEGER NOT NULL REFERENCES customers(id),
  project_id         INTEGER NOT NULL REFERENCES projects(id),
  order_intake_id    INTEGER REFERENCES order_intakes(id),
  uppdragstyp        TEXT NOT NULL CHECK (uppdragstyp IN ('schakt','grus_leverans','kran','container','maskintransport','ovrigt')),
  material           TEXT,
  uppskattad_mangd   REAL,
  mangd_enhet        TEXT CHECK (mangd_enhet IN ('ton','m3','lass')),
  antal_lass         INTEGER,
  datum_fran         TEXT NOT NULL,          -- YYYY-MM-DD
  datum_till         TEXT,
  tid                TEXT,                   -- HH:MM
  fran_text          TEXT, till_text TEXT,
  instruktioner      TEXT,
  kontaktperson      TEXT, telefon TEXT,
  status             TEXT NOT NULL DEFAULT 'bekraftad' CHECK (status IN ('bekraftad','pagar','klar','avbruten')),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One job can have several trucks and days.
CREATE TABLE job_assignments (
  id                   INTEGER PRIMARY KEY,
  company_id           INTEGER NOT NULL REFERENCES companies(id),
  job_id               INTEGER NOT NULL REFERENCES jobs(id),
  vehicle_id           INTEGER NOT NULL REFERENCES vehicles(id),
  driver_id            INTEGER NOT NULL REFERENCES drivers(id),
  datum                TEXT NOT NULL,
  miljozon_warning     INTEGER NOT NULL DEFAULT 0,   -- snapshot at assignment time
  miljozon_ack_user_id INTEGER REFERENCES users(id), -- office confirmed the warning anyway
  sms_status           TEXT NOT NULL DEFAULT 'ej_skickat'
                       CHECK (sms_status IN ('ej_skickat','skickat','simulerat','misslyckat')),
  sms_sent_at          TEXT,
  created_by_user_id   INTEGER NOT NULL REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cancelled_at         TEXT
);

-- Opaque random token in the SMS; only its SHA-256 is stored. Scoped to one driver.
CREATE TABLE driver_links (
  id           INTEGER PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id),
  driver_id    INTEGER NOT NULL REFERENCES drivers(id),
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  last_used_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Lass identity row (immutable). All data lives in lass_versions.
CREATE TABLE lass (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  job_id        INTEGER NOT NULL REFERENCES jobs(id),
  assignment_id INTEGER REFERENCES job_assignments(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE lass_versions (
  id                    INTEGER PRIMARY KEY,
  lass_id               INTEGER NOT NULL REFERENCES lass(id),
  version               INTEGER NOT NULL,
  customer_id           INTEGER NOT NULL REFERENCES customers(id),  -- snapshot
  project_id            INTEGER NOT NULL REFERENCES projects(id),   -- snapshot
  vehicle_regnr         TEXT,
  driver_id             INTEGER REFERENCES drivers(id),
  datum                 TEXT NOT NULL,       -- local date
  tid                   TEXT,                -- HH:MM
  fran_text             TEXT,
  till_namn             TEXT, till_orgnr TEXT, till_adress TEXT,
  material              TEXT,
  avfallskod            TEXT CHECK (avfallskod IS NULL OR avfallskod GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
  farligt_avfall        INTEGER NOT NULL DEFAULT 0 CHECK (farligt_avfall IN (0,1)),
  netto_kg              INTEGER CHECK (netto_kg IS NULL OR netto_kg > 0),
  vagsedel_nr           TEXT,
  photo_id              TEXT REFERENCES photos(id),
  ai_extraction_id      INTEGER REFERENCES ai_extractions(id),
  field_confidence_json TEXT,
  review_status         TEXT NOT NULL CHECK (review_status IN ('behover_granskas','ok','granskad')),
  note                  TEXT,
  change_reason         TEXT,                -- required when version > 1
  created_by_kind       TEXT NOT NULL CHECK (created_by_kind IN ('driver','office','system')),
  created_by_user_id    INTEGER REFERENCES users(id),
  created_by_driver_id  INTEGER REFERENCES drivers(id),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (lass_id, version)
);
CREATE TRIGGER lass_versions_no_update BEFORE UPDATE ON lass_versions
BEGIN SELECT RAISE(ABORT, 'lass_versions is append-only'); END;
-- DELETE is allowed only from the retention job (code convention + audit_log entry).

CREATE VIEW lass_current AS
SELECT v.*, l.job_id, l.assignment_id, l.company_id,
       (SELECT created_at FROM lass_versions v1 WHERE v1.lass_id = l.id AND v1.version = 1) AS reported_at,
       CASE WHEN v.version > 1 THEN v.created_at END AS corrected_at,
       CASE WHEN v.version > 1 THEN COALESCE(v.created_by_user_id, v.created_by_driver_id) END AS corrected_by
FROM lass l
JOIN lass_versions v ON v.lass_id = l.id
WHERE v.version = (SELECT MAX(version) FROM lass_versions WHERE lass_id = l.id);

-- Fakturaunderlag. A lass can sit on at most one live invoice line (no double invoicing).
CREATE TABLE invoice_batches (
  id                  INTEGER PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  iso_week            TEXT NOT NULL,         -- e.g. 2026-W40
  customer_id         INTEGER NOT NULL REFERENCES customers(id),
  project_id          INTEGER REFERENCES projects(id),
  kind                TEXT NOT NULL CHECK (kind IN ('fortnox','manuell')),  -- manuell = CSV/PDF + "lås underlag"
  status              TEXT NOT NULL CHECK (status IN ('pending','skapad','misslyckad','makulerad')),
  external_ref        TEXT NOT NULL UNIQUE,  -- uuid, also written to Fortnox ExternalInvoiceReference1
  fortnox_document_nr TEXT,
  total_ore           INTEGER NOT NULL,
  vat_mode            TEXT NOT NULL,
  lines_snapshot_json TEXT NOT NULL,
  error               TEXT,
  created_by_user_id  INTEGER NOT NULL REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE invoice_lines (
  id           INTEGER PRIMARY KEY,
  batch_id     INTEGER NOT NULL REFERENCES invoice_batches(id) ON DELETE CASCADE,
  lass_id      INTEGER REFERENCES lass(id),
  lass_version INTEGER,
  job_id       INTEGER REFERENCES jobs(id),  -- fixed-price lines
  description  TEXT NOT NULL,
  quantity     REAL NOT NULL,
  unit         TEXT NOT NULL,
  price_ore    INTEGER NOT NULL,
  amount_ore   INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_invoice_lines_lass      ON invoice_lines(lass_id) WHERE lass_id IS NOT NULL;
CREATE UNIQUE INDEX ux_invoice_lines_fixed_job ON invoice_lines(job_id)  WHERE lass_id IS NULL AND job_id IS NOT NULL;
-- A failed or voided batch deletes its lines (the snapshot stays on the batch), which releases the lass.

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id),
  actor_kind  TEXT NOT NULL CHECK (actor_kind IN ('office','driver','system')),
  actor_id    INTEGER,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  action      TEXT NOT NULL,
  before_json TEXT, after_json TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

If D3 ("hours") is accepted, `002_time_entries.sql` adds an append-only `time_entries (assignment_id, datum, timmar, source, created_by_*)` table.

### Business rules encoded in code (unit tested)

- **Price resolution:** project list → customer list → default; the most specific item wins. `ton` → `round(price_ore * netto_kg / 1000)` per row. `lass` → 1 × price. `fast` → one line per job. `timme` → hours source (D3). A missing price rule blocks the row with "Pris saknas".
- **Review gate:** a lass is `behover_granskas` when any billing-relevant field (`datum`, `vagsedel_nr`, `material`, `netto_kg` when priced per ton) is `lag`/`saknas`, when it was entered manually without a photo, when the `vagsedel_nr` is a duplicate within the company, or when `farligt_avfall = 1`. It becomes `granskad` only through an office review, which writes a new version. Any `behover_granskas` row blocks that customer's export.
- **Week grouping:** ISO-8601 week of the local `datum`, Monday–Sunday, Europe/Stockholm. Grouped as customer → project → lass.
- **Confidence:** the model reports `hog/medel/lag` per field, then deterministic validators can only *downgrade* it. Validators: date parse and plausibility, org-nr Luhn check, Swedish phone format, `regnr` present in the fleet and equal to the assigned vehicle, 0.5 t ≤ netto ≤ 40 t, 6-digit EWC code.
- **Miljözon:** a warning when `vehicles.miljozonsklass < projects.miljozon`. The office must acknowledge it to assign anyway. `projects.miljozon` is set by the office; the UI suggests a value from a static Stockholm postnummer table.

---

## 4. API

All request bodies are validated with zod. Errors use a stable `{ error: { code, message_sv } }` shape and never leak `err.message`. Rate limits: AI endpoints 30 per 15 min per user or link, SMS endpoints 20 per 15 min, login 10 per 15 min.

### 4.1 Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | office → JWT `{sub, companyId, role:'office'}` |
| GET | `/api/auth/me` | |
| POST | `/api/driver/session` | `{token}` → short JWT `{driverId, linkId, role:'driver'}` that expires with the link |

### 4.2 Order intake (office)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/intake/extract` | `{text}` (≤20k chars) → `{intake_id, fields:{key:{value, confidence}}, suggestions:{customers:[{id, name, score, reason}], projects:[...]}}` |
| GET | `/api/intake/:id` | |
| POST | `/api/intake/:id/confirm` | `{fields, customer:{id}\|{new:{...}}, project:{id}\|{new:{...}}}` → job. Creating a new customer with an existing org nr returns 409 and the match. |
| POST | `/api/intake/:id/discard` | |

### 4.3 Master data (office)
`GET/POST/PATCH /api/customers`, `GET /api/customers/search?q=` (fuzzy) · `GET/POST/PATCH /api/projects` · `GET/POST/PATCH /api/vehicles` · `GET/POST/PATCH /api/drivers` · `GET/POST/PATCH /api/price-lists` with `/api/price-lists/:id/items` · `GET/PATCH /api/settings`

### 4.4 Jobs + dispatch (office)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/jobs?from&to&status&project_id` | |
| GET / PATCH | `/api/jobs/:id` | |
| POST | `/api/jobs/:id/cancel` | |
| POST | `/api/jobs/:id/assignments` | `{vehicle_id, driver_id, datum, acknowledge_miljozon?, send_sms}` → 409 `miljozon_warning` unless acknowledged |
| POST | `/api/assignments/:id/send-sms` | creates or rotates the driver link, sends via 46elks |
| DELETE | `/api/assignments/:id` | soft cancel |

### 4.5 Lass (office)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/lass?job_id&project_id&customer_id&from&to&review` | |
| GET | `/api/lass/:id` | current version plus all versions |
| POST | `/api/lass` | manual office entry |
| POST | `/api/lass/:id/versions` | correction (`change_reason` required) |
| POST | `/api/lass/:id/review` | writes a new version with `review_status='granskad'` |
| GET | `/api/photos/:id` | office JWT, or the driver JWT that owns the lass |

### 4.6 Driver (driver JWT, scoped to its own assignments)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/driver/assignments` | today and upcoming |
| GET | `/api/driver/assignments/:id` | job details plus today's lass |
| POST | `/api/driver/photos` | multipart image (≤15 MB in). The server re-encodes it to ≤2000 px JPEG and **strips EXIF/GPS**, stores it, runs the vågsedel extraction → `{photo_id, extraction}`. If extraction fails, the response is `{photo_id, extraction:null}` and the client falls back to manual entry. |
| POST | `/api/driver/lass` | `{assignment_id, photo_id?, ai_extraction_id?, fields, client_uuid}`. The `client_uuid` makes offline retries idempotent. |
| POST | `/api/driver/lass/:id/versions` | the driver corrects their own lass until the office has reviewed it |

### 4.7 Outputs (office)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/massredovisning?project_id&from&to` | JSON. `&format=csv` returns CSV (UTF-8 BOM, `;` separator, Swedish Excel friendly). The PDF is rendered client-side with the existing jsPDF setup. |
| GET | `/api/fakturaunderlag?week=2026-W40` | grouped rows, totals, blockers, already-invoiced flags |
| POST | `/api/fakturaunderlag/fortnox` | `{week, customer_id, project_id?}` → creates a Fortnox **unbooked** invoice. It never calls `bookkeep` or a send endpoint. |
| POST | `/api/fakturaunderlag/lock` | the "manuell" route for customers without Fortnox: claims the lass so they can't be invoiced twice |
| GET | `/api/fakturaunderlag/export.csv?week&customer_id` | |
| GET / POST / DELETE | `/api/fortnox/status`, `/connect-url`, `/callback`, `/disconnect`, `POST /api/fortnox/sync-customers` | |

### 4.8 GDPR / admin (office)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/drivers/:id/export` | all personal data held about a driver (JSON) |
| POST | `/api/drivers/:id/erase` | name → "Raderad förare #id", phone → NULL, revoke links, optionally delete their photos (D6). Audited. |
| GET / PATCH | `/api/settings/retention` | |

A nightly retention job enforces the D5 policy. A nightly backup (`VACUUM INTO` plus the photos directory) runs as decided in D14.

---

## 5. Frontend

Swedish only. The current light design tokens in `index.css` are kept, along with `Button`, `Card`, `Toast`, `Logo` and the jsPDF layout helpers. Navigation becomes a small path-based router (`history.pushState`; no new dependency) so pages are linkable.

| Page | Path | Purpose |
|---|---|---|
| Logga in | `/login` | |
| Översikt | `/` | Today's jobs, lass att granska, veckans underlag status, farligt avfall to report (with deadline), Fortnox reconnect banner |
| Ny beställning | `/bestallning/ny` | Paste box → extracted form. Fields are colour-coded by confidence; low or missing fields must be touched before confirm. Customer/project match suggestions, or "Skapa ny" with a duplicate check. Then **Bekräfta uppdrag**. |
| Uppdrag | `/uppdrag`, `/uppdrag/:id` | List and calendar strip. Detail page: tilldela fordon + förare (miljözon warning), skicka SMS, lass for this job |
| Granska lass | `/lass` | Review queue: photo next to the fields, version history, Godkänn / Korrigera (reason required) |
| Massredovisning | `/massor` | Project + date range → table, farligt avfall warnings, CSV/PDF export |
| Fakturaunderlag | `/faktura` | Week picker (default: current ISO week). Customer → project → rows with totals and blockers. **Skapa utkast i Fortnox**, CSV/PDF, "Lås underlag" |
| Kunder & projekt | `/kunder` | Customers, projects (miljözon, customer_ref), price list per customer/project |
| Fordon & förare | `/flotta` | Vehicles (regnr, typ, miljözonsklass, aktiv). Drivers (namn, telefon, export / radera personuppgifter) |
| Inställningar | `/installningar` | Company info, default price list, Fortnox connection, data retention, office users |
| **Förarsida** | `/f/:token` | Mobile-first, no office chrome. Mina uppdrag → uppdrag → **Rapportera lass** (`<input type=file accept=image/* capture=environment>`, which works over plain-http LAN, unlike `getUserMedia`). Then a review screen with large fields, then Skicka. Also "Utan foto". Client-side downscale before upload. An IndexedDB outbox queues photos and lass when offline and retries them. Buttons are ≥56 px with high contrast, and weight inputs use the numeric keypad. |

---

## 6. Runtime and deployment review (local-only)

Railway is out. The app runs on the developer laptop from VS Code. "EU region" therefore means "data stays on this laptop plus whatever third parties receive it".

| # | Finding | Risk | Proposal |
|---|---|---|---|
| R1 | **Drivers in the field are not on the office Wi-Fi.** A LAN-only magic link only works while the phone is on the same network as the laptop. | High: the core driver flow can't be used for real until there is a reachable URL. | Build and demo on LAN now. `PUBLIC_BASE_URL` is the only thing that changes when a tunnel (e.g. Cloudflare Tunnel, Tailscale Funnel) or an EU host is added later. **D2** |
| R2 | The LAN IP comes from DHCP and can change, which breaks links already sent. | Medium | Reserve a fixed IP in the router. (`.local` mDNS names don't resolve reliably on Android.) |
| R3 | Plain HTTP on the LAN: JWTs and links travel unencrypted over Wi-Fi. Binding `0.0.0.0` exposes the API to everyone on the network, including on public Wi-Fi. | Medium (demo), High (production) | Run only on trusted networks. Strong office password; no seeded default credentials outside `npm run seed`. Rate-limit login. |
| R4 | The DB and photos sit on one laptop: theft, disk loss or a closed lid means downtime or data loss for spårbarhet records. | High for real use | FileVault on. Nightly `VACUUM INTO` backup plus photos to a second location. **D14** |
| R5 | `server/data/kemoffs.db` and `server/node_modules` are committed. | Medium | Untrack both in Phase 2. `DATA_DIR` is git-ignored. |
| R6 | Order texts (names, phone numbers) and vågsedel photos are sent to Anthropic. The API's `inference_geo` only offers `us` / `global`; there is no EU pinning. | GDPR transfer to a US processor | List Anthropic as a sub-processor in the customer DPA (Anthropic's commercial terms include a DPA with SCCs). Strip EXIF/GPS. Never send the driver's phone. **D16** |
| R7 | 46elks (Sweden) and Fortnox (Sweden) are EU processors. | Low | — |
| R8 | 46elks delivery reports and inbound SMS need a publicly reachable webhook, so they're unavailable locally. | Low | Track send status from the API response only. Order intake is paste-only for now; email or SMS forwarding would need a public endpoint or IMAP polling (later). |
| R9 | Fortnox redirect URI `http://localhost:3002/api/fortnox/callback` must be registered in the Fortnox developer portal. | Low | Verify in Phase 6. If Fortnox rejects plain-http localhost, use a tunnel URL for the callback only. |

---

## 7. External API findings

**Anthropic.** The current recommended model is `claude-opus-5`, set through `ANTHROPIC_MODEL`.
- Use structured outputs: `client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })`. This replaces forced `tool_choice`, which also returns a 400 on newer models such as `claude-opus-5-5`.
- Run extraction at `output_config.effort: "low"`.
- The vision limit is 2576 px on the long edge; we send ≤2000 px.
- Rough cost at Opus 5 list prices ($5 / $25 per million tokens): about $0.02–0.03 per vågsedel and about $0.02 per order. That's roughly $100–150 per month for 30 trucks × 8 lass × 21 days. `claude-sonnet-5` would cost about 40% of that; switching is your call, through the env var.
- The skill guidance recommends enabling server-side refusal `fallbacks`; I'll include it unless you object.

**46elks.**
- The sender must be ≤11 characters, ASCII letters and digits only. `ELKS_SENDER=Akaren`.
- A message splits at 153 characters per GSM part. The link stays short because the token is 22 base64url characters, not a JWT.
- No delivery webhooks locally (R8).

**Fortnox.**
- `POST /3/invoices` creates an **unbooked** invoice; booking (`PUT …/bookkeep`) and sending (`…/email`, `…/einvoice`) are separate calls that we never make.
- The access token lasts 1 h. The refresh token **rotates on every use** and expires after 45 days unused. We need an in-process refresh lock plus `fortnox_status='reconnect_required'` on `invalid_grant`.
- **Verify in Phase 6 against a sandbox:**
  - The row quantity field (`DeliveredQuantity`).
  - Row `Description` maximum length; I believe it's around 50 characters, so the vågsedelnummer goes first in the description.
  - Whether `Unit` codes (`t`, `st`, `tim`) must exist in the customer's Fortnox settings.
  - `ExternalInvoiceReference1`, used for idempotent retries.
  - The reverse-charge fields.

---

## 8. Decisions needed before "go"

| # | Question | Recommendation |
|---|---|---|
| D1 | Remove the features in §2.2 that the spec doesn't mention? | **Yes, remove all of them.** The archive tag keeps them. |
| D2 | Drivers off the office Wi-Fi can't reach a LAN-only link. | Build for LAN now and keep `PUBLIC_BASE_URL` as the single switch for a tunnel or EU host later. |
| D3 | The spec has per-hour prices but no source for hours. | The driver enters hours per assignment and day on the driver page (kran and maskintransport); the office can correct them. Adds `time_entries`. |
| D4 | VAT: schakt and maskin-med-förare for construction customers may fall under **omvänd byggmoms**; pure material transport usually doesn't. | `vat_mode` per customer (default 25%) and a matching Fortnox setting. **Confirm the rules with your accountant**; the app won't decide this. |
| D5 | A 36-month delete conflicts with bokföringslagen (7 years) for invoiced underlag. | At `retention_months`, delete photos and pseudonymise drivers. Keep invoiced lass rows (without personal data) for 7 years. Delete uninvoiced and non-billing records at `retention_months`. |
| D6 | Driver erasure vs photos as spårbarhet evidence. | Erasure anonymises name and phone and revokes links. Photos stay until retention unless "radera även foton" is ticked. |
| D7 | Magic link format and lifetime. | An opaque random token in the URL (short SMS, revocable), not a JWT. One link per driver, valid until 23:59 the day after their last assigned date, capped at `DRIVER_LINK_MAX_DAYS` (7). A new assignment extends the link or issues a new one. |
| D8 | Keep `company_id` scoping? | **Keep it.** It's cheap, matches the existing code, and avoids a rewrite if this is hosted for several åkerier later. |
| D9 | Fresh `akaren.db`, no migration of `kemoffs.db` (demo data only)? | **Yes.** |
| D10 | Model | `ANTHROPIC_MODEL=claude-opus-5` (current recommendation). Your call if cost matters more (`claude-sonnet-5`). |
| D11 | Level of the end-to-end test | An API-level E2E (supertest against the real Express app and a real SQLite file, with Anthropic, 46elks and Fortnox mocked). A browser test (Playwright) can be added later. |
| D12 | Fortnox grouping | One draft invoice per **customer + project** per week. "Er referens" = `customer_ref`; one row per lass. |
| D13 | Which zone is the job in, with no routing? | `projects.miljozon` set by the office, suggested from a static Stockholm postnummer table. |
| D14 | Backups | Nightly local `VACUUM INTO` plus a photos copy to a configurable folder (e.g. an external disk or iCloud Drive folder). Drop S3. |
| D15 | Email/SMS forwarding intake | Paste-only for now (R8). |
| D16 | Sending personal data to Anthropic (US) | Proceed, with Anthropic listed as a sub-processor and data minimised. |

---

## 9. Phase checklist

Each phase ends with a commit and a short summary of changes and manual setup steps.

**Phase 2: archive, remove, new schema, seed**
1. `git tag pre-pivot-archive fb5d389`. Push the tag to `origin` only with your OK.
2. Untrack `server/node_modules` and `server/data/*.db*`. Fix `.gitignore` (add `DATA_DIR`, `server/backups/`, `*.db`).
3. Delete everything in §2.1 and in §2.2 (per D1) on the server and client. Remove the dead dependencies and env vars (§2.3–2.4).
4. Restructure the server:
   - `config.js` (validated env, no secret fallbacks)
   - `db/index.js` (`openDb(path)`, `migrate()`)
   - `db/migrations/001_init.sql`
   - `app.js` (`createApp({ db, anthropic, sms, fortnox })` for tests)
   - `index.js` (listen on `HOST:PORT`)
5. Make all URLs env-driven: CORS list, Fortnox redirect-back, Vite proxy (`loadEnv`), and the external API bases.
6. Rewrite `server/.env.example` per §2.4. Update `.vscode/tasks.json` and the root scripts. Add `npm run seed` and `npm test`.
7. Client: strip the removed pages, i18n and Dexie sync. Add the path router and an empty Swedish shell with the new navigation.
8. Seed "Teståkeriet AB": 5 vehicles (mixed miljözonsklass), 4 drivers, 3 customers, 4 projects (one in miljözon 1), a default price list plus customer lists, and 2 weeks of lass. The lass include a few low-confidence rows, one farligt avfall row and one corrected (v2) row. All names and org numbers are fictional.
9. Vitest scaffold and the first tests: migrations apply cleanly; the append-only trigger works.

**Phase 3: AI order intake**
1. `services/anthropic.js` (injectable client, `ANTHROPIC_MODEL`, structured outputs, per-field confidence, validators, `ai_extractions` logging, no mock fallback).
2. `lib/match.js` (normalise, org-nr exact match, trigram name and address similarity, reasons).
3. Intake routes and the "Ny beställning" page with confidence highlighting, the confirm gate and the duplicate guard.
4. Unit tests: extraction-response parsing and validation (including malformed and partial responses), matching.

**Phase 4: dispatch + driver page + vågsedel extraction**
1. Assignments with the miljözon check, `driver_links` (hashed, scoped, expiring, revocable), the 46elks sender fix and the SMS template.
2. Photo pipeline: `sharp` re-encode, EXIF strip, random ids, authorised serving.
3. Vågsedel extraction plus the validators (regnr vs assigned vehicle, weight bounds, date).
4. Driver page `/f/:token`: camera, review, manual fallback, multiple lass per day, IndexedDB outbox with `client_uuid` idempotency.
5. Tests: vågsedel parsing, link expiry and scope (a driver can't read another driver's job or photo).

**Phase 5: massor log + exports**
1. Lass versioning and review endpoints, and the "Granska lass" page with history.
2. Farligt avfall banner with the "rapportera inom 2 arbetsdagar" deadline (weekend and Swedish-holiday aware).
3. Massredovisning CSV (server) and PDF (client jsPDF), per project and date range.
4. Tests: versioning never mutates; the working-day deadline calculation.

**Phase 6: fakturaunderlag + Fortnox drafts**
1. `lib/pricing.js` and `lib/weeks.js` (unit tested).
2. Fakturaunderlag endpoint and page: grouping, totals, blockers, already-invoiced flags.
3. `lib/fortnoxPayload.js` (unit tested). Fortnox service hardening: refresh lock, `reconnect_required`, idempotent batches via `external_ref`. Customer mapping, and the CSV/PDF + "lås" route.
4. Sandbox verification of the §7 Fortnox items, with any spec adjustments reported back to you.

**Phase 7: tests, cleanup, docs, run checklist**
1. API E2E happy path: paste order → confirm → assign + SMS (mock) → driver reports lass (mock vision) → office reviews → fakturaunderlag → Fortnox draft (mock).
2. Retention job and driver erasure tests. Remove dead code. Lint.
3. Update `README.md` and `CLAUDE.md`. Add a **local run checklist** (LAN IP, fixed DHCP, firewall, FileVault, backups, env) and a short **future hosting checklist** (EU region, persistent volume, HTTPS, tunnel option). This replaces the Railway checklist.
