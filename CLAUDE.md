# Åkaren

> **Pivot in progress.** Phase 2 (cleanup, new schema, seed, master data) is done. Phases 3–7 are tracked in `docs/pivot-plan.md`, which is the source of truth for the target data model, routes and pages. The old full TMS is archived at git tag `pre-pivot-archive`.

## Product focus

A focused add-on for Stockholm åkerier (10–50 trucks) in schakt/anläggning. It runs **alongside** their existing system and does exactly three things:

1. **AI order intake.** Pasted order text (email, SMS, PDF text) becomes a draft job. The office confirms it before it becomes real.
2. **Lass logging.** The driver photographs the vågsedel, AI extracts the fields, the driver checks them, and the lass is logged against the right customer and project.
3. **Output.** A weekly fakturaunderlag per customer/project, pushed to Fortnox as **draft** invoices, plus an exportable massor/spårbarhet log (Massredovisning) per project.

Promise to customers: *"Fakturaunderlaget är klart på fredagen och ni kan alltid visa vart varje lass tog vägen."*

If a change doesn't serve one of those three things, it probably doesn't belong here.

## Do not rebuild

These were removed on purpose. Don't reintroduce them, even partially, without an explicit decision from the owner:

- EU 561/2006 driving-time compliance
- LEZ-avoidance routing, OpenRouteService or any other routing/geocoding. Miljözon is a **static** check only: `vehicles.miljozonsklass < projects.miljozon` → warning.
- Pricing intelligence or price suggestions
- Tender matching (TED/upphandlingar). That belongs to a separate product.
- Multi-role RBAC. There are exactly two roles: `office` (JWT login) and `driver` (no account; a signed, expiring magic link scoped to one driver).
- Railway deployment config. The app runs locally only, for now.
- Also removed (decision D1): the offert/quote flow and public quote page, the customer portal, Stripe, BankID, CO2, Nätverk, Drivmedel, Underhåll, profitability dashboards, weather/road alerts/fuel price, the onboarding tour, the English UI (i18n), offline sync of the office app, and S3 backups.

## Stack

- **Client:** React 19, Vite 8, Tailwind 4, `motion`, `lucide-react`, jsPDF. Design tokens live in `client/src/index.css`: a clean, light Scandinavian look in Geist. Keep it.
- **Server:** Node ≥20.19, Express 4, better-sqlite3 (WAL), JWT, multer + sharp for photos, zod for validation, node-cron.
- **Integrations:**
  - Anthropic: `@anthropic-ai/sdk`, structured outputs, model from `ANTHROPIC_MODEL`.
  - 46elks: SMS.
  - Fortnox: OAuth, draft invoices only.

## Layout

```
server/
  index.js            entry: config → db → migrate → listen on HOST:PORT
  app.js              createApp({ config, db, services }): all routes; services are injectable
  config.js           zod-validated env (single source of config)
  db/                 openDb, migrate, migrations/NNN_*.sql
  routes/             one router factory per area: (deps) => Router
  services/           external APIs: fortnox.js, sms.js (46elks), encrypt.js
  lib/                dates (ISO weeks, Stockholm time), normalize, schemas (zod + sv messages), http, audit, sql
  jobs/backup.js      nightly VACUUM INTO + optional BACKUP_DIR mirror
  seed/               demo.js (seedDemo) + run.js (CLI)
  tests/              vitest + supertest; in-memory SQLite
client/src/
  App.jsx             auth gate + route table
  components/         AppShell, Button, Dialog, Field, Link, PageHeader, Toast
  lib/                api, router (history API), useApi, useForm, labels (sv), auth/toast contexts
  pages/              one file per page
```

## Running locally

```bash
npm run setup                         # installs root, server and client
cp server/.env.example server/.env    # fill in JWT_SECRET, ENCRYPTION_KEY, PUBLIC_BASE_URL
npm run seed                          # Teståkeriet AB demo data (prints the login)
npm run dev                           # server :3002 + Vite :5173
```

- Or use the VS Code task **"Start Åkaren"**.
- `npm run seed -- --reset` wipes and reseeds.
- `npm run build && npm start` serves the built client from the API port.

- Both processes bind `HOST=0.0.0.0`, so a phone on the same Wi-Fi can open driver links. Set `PUBLIC_BASE_URL` to `http://<laptop-LAN-IP>:5173`.
- Every URL comes from env: `APP_URL`, `PUBLIC_BASE_URL`, `FORTNOX_REDIRECT_URI`, `VITE_API_TARGET`, and the `*_API_BASE` vars. Never hardcode `localhost` outside `.env.example`.
- Without `ELKS_*` credentials, SMS is simulated and logged to the console. Without `ANTHROPIC_API_KEY`, the extraction endpoints return a clear error. **Never fall back to fake data.**

## Testing

```bash
npm test            # vitest (server unit + API tests)
npm run lint        # client ESLint (must pass)
npm run build       # client production build
```

- External APIs (Anthropic, 46elks, Fortnox) are **always mocked** in tests. Inject clients through `createApp({ ... })`; never hit real services.
- Each test gets a fresh SQLite DB with all migrations applied.
- Required coverage:
  - extraction-response parsing/validation
  - price calculation
  - ISO-week grouping
  - Fortnox payload building
  - lass append-only versioning
  - magic-link scope/expiry
  - one API e2e happy path (paste order → confirm → driver lass → review → fakturaunderlag → Fortnox draft)

## Conventions

**Language.** UI text is Swedish. Code, comments, identifiers, commit messages and docs are English. DB enum values are ASCII snake_case Swedish domain terms (`schakt`, `grus_leverans`, `behover_granskas`), mapped to Swedish labels in the UI.

**Units.**
- Money is **integer öre ex VAT**.
- Weight is **integer kg** (display as ton with a comma decimal).
- Business dates are local `YYYY-MM-DD` in Europe/Stockholm. Timestamps are UTC ISO-8601.
- Weeks are ISO-8601, Monday–Sunday.

**Database.**
- Schema changes go in a new numbered file in `server/db/migrations/`. Never edit an applied migration.
- Prepared statements only; no string-built SQL with user input.
- Every query is scoped by `company_id`.

**Lass records are append-only.** A correction writes a new row in `lass_versions` with `change_reason`; nothing is ever updated in place, and a DB trigger enforces this. Only the retention job may delete, and it logs to `audit_log`.

**Human in the loop.** AI output never becomes a job or a confirmed lass without a person confirming it. Low-confidence or missing fields are highlighted and must be touched. Validators may only *downgrade* model-reported confidence. Rows still needing review block the fakturaunderlag export.
- For order intake, the server enforces this: `POST /api/intake/:id/confirm` rejects any `lag` AI value that is unchanged and not in `acknowledged`.
- What the user changed or accepted is stored on `order_intakes.overrides_json`.

**AI calls** go through `services/ai.js` only.
- Use structured outputs (`messages.parse` + `zodOutputFormat`), adaptive thinking and `effort: 'low'`.
- Every call is logged in `ai_extractions` with tokens and estimated cost (`lib/aiCost.js`).
- `AI_MONTHLY_BUDGET_USD` is checked before each call.
- `refusal`, `max_tokens` and parse failures raise errors. Never substitute mock or guessed data.
- Prompts treat pasted text as untrusted data inside `<order>` tags.
- Bump `ORDER_PROMPT_VERSION` when the prompt or schema changes.

**Matching.** Customers and projects are fuzzy-matched (org nr, name, address) and *suggested*. Never auto-create duplicates.

**Fortnox.**
- Create unbooked invoices only. Never call `bookkeep` or any send endpoint.
- Store the document number on the batch and claim each lass with a unique index so nothing is invoiced twice.
- Refresh tokens rotate on every use: refresh behind a lock, and on `invalid_grant` set `fortnox_status='reconnect_required'` and show a reconnect prompt.

**46elks.** The sender ID is ≤11 characters, ASCII letters and digits only (`ELKS_SENDER`, default `Akaren`, no "Å").

**Security.**
- Secrets live only in env. The server refuses to start without `JWT_SECRET` (≥32 chars) and `ENCRYPTION_KEY`.
- Validate every request body with zod.
- Rate-limit login, the AI endpoints and the SMS endpoints.
- Return Swedish user-facing error messages; never send `err.message` to the client.

**Personal data.**
- Driver phone numbers and photos are personal data.
- Photos get random 128-bit ids, are re-encoded with EXIF/GPS stripped, and are served only to the office or to the owning driver link.
- Retention defaults to 36 months (`companies.retention_months`). Driver erasure anonymises the driver.

**Dependencies.** Don't add a new one without a reason. Prefer small in-house helpers (e.g. fuzzy matching, the router).
