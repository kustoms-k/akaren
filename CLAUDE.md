# Lasskoll

> **Name.** The product is **Lasskoll** ("Koll på varje lass"), renamed from Åkaren on 2026-10-06. Everything a user, driver or prospect sees says Lasskoll. Code identifiers keep `akaren`: the repo, package names, `akaren.db`, localStorage keys, Docker project and volume names. Don't rename those.

> **Pivot in progress.** Phases 2–6 are done: cleanup and schema, AI order intake, dispatch and the driver page, lass review, hazardous-waste reporting and Massredovisning, and the weekly fakturaunderlag with Fortnox drafts. The order inbox (`/inkorg`) exists as a demo mailbox; real mailbox connections come later. Fortnox payload details still need a sandbox check (pivot plan §7). Next is Phase 7. `docs/pivot-plan.md` is the source of truth for the target data model, routes and pages, with a progress log at the top. The old full TMS is archived at git tag `pre-pivot-archive`.

## Product focus

A focused add-on for Stockholm åkerier (10–50 trucks) in schakt/anläggning. It runs **alongside** their existing system and does exactly three things:

1. **AI order intake.** Pasted order text (email, SMS, PDF text) becomes a draft job. The office confirms it before it becomes real.
2. **Lass logging.** The driver photographs the vågsedel, AI extracts the fields, the driver checks them, and the lass is logged against the right customer and project.
3. **Output.** A weekly fakturaunderlag per customer/project, pushed to Fortnox as **draft** invoices, plus an exportable massor/spårbarhet log (Massredovisning) per project.
   - **Förlustkontroll** (`/forlustkontroll`, `lib/lossCheck.js`) compares a weighing list with an invoice specification and shows the loads that never reached an invoice, as a PDF report. Stateless: nothing from the files is stored, so it can be run on a prospect's data.
   - **Avstämning** (`/avstamning`) guards the fakturaunderlag: the office imports a receiving facility's weighing list (CSV or rows pasted from Excel) and sees every weighing with no lass (a load that would never be invoiced), every lass whose values differ from the scale, and every lass to the facility that isn't on the list.

Promise to customers: *"Fakturaunderlaget är klart på fredagen och ni kan alltid visa vart varje lass tog vägen."*

If a change doesn't serve one of those three things, it probably doesn't belong here.

## Do not rebuild

These were removed on purpose. Don't reintroduce them, even partially, without an explicit decision from the owner:

- EU 561/2006 driving-time compliance
- LEZ-avoidance routing, OpenRouteService or any other routing/geocoding. Miljözon is a **static** check only: `vehicles.miljozonsklass < projects.miljozon` → warning.
- Pricing intelligence or price suggestions
- Tender matching (TED/upphandlingar). That belongs to a separate product.
- Multi-role RBAC. There are exactly two roles: `office` (JWT login) and `driver` (no account; a signed, expiring magic link scoped to one driver).
- Railway or any other platform-specific deployment config. Hosting is one EU server with Docker Compose (`deploy/`, owner decision 2026-10-06); keep it that way.
- Also removed (decision D1): the offert/quote flow and public quote page, the customer portal, Stripe, BankID, CO2, Nätverk, Drivmedel, Underhåll, profitability dashboards, weather/road alerts/fuel price, the onboarding tour, the English UI (i18n), offline sync of the office app, and S3 backups.

## Stack

- **Client:** React 19, Vite 8, Tailwind 4, `motion`, `lucide-react`, jsPDF.
- **Brand ("Tallgrön").** Design tokens live in `client/src/index.css`:
  - pine green `--accent` #1f4d3a for the brand and primary actions
  - warm sand-tinted neutrals and a green-tinted ink
  - Geist type
  - semantic colours (info blue, success, amber, red) kept separate from the brand green

  The mark and wordmark are in `client/src/assets/Logo.jsx` (a load of soil on a truck bed with a check), and the favicon is `client/public/favicon.svg`. Buttons take their colours from the tokens (`.btn-*`). Use the tokens; don't hard-code colours.
- **Server:** Node ≥20.19, Express 4, better-sqlite3 (WAL), JWT, multer + sharp for photos, zod for validation, node-cron.
- **Integrations:**
  - Anthropic: `@anthropic-ai/sdk`, structured outputs, model from `ANTHROPIC_MODEL`.
  - 46elks: SMS.
  - Fortnox: OAuth, draft invoices only.
  - SMTP (`nodemailer`): order confirmation emails to customers only.

## Layout

```
server/
  index.js            entry: config → db → migrate → listen on HOST:PORT
  app.js              createApp({ config, db, services }): all routes; services are injectable
  config.js           zod-validated env (single source of config)
  db/                 openDb, migrate, migrations/NNN_*.sql
  routes/             one router factory per area: (deps) => Router
  services/           external APIs: fortnox.js, sms.js (46elks), mail.js (SMTP), ai.js, encrypt.js;
                      plus photos.js (store), lass.js (append-only versions), dispatch.js (links + SMS),
                      inbox.js (store incoming mail, thread it, record replies)
  lib/                dates (ISO weeks, Stockholm time), workdays (Swedish holidays, deadlines), normalize,
                      schemas (zod + sv messages), http, audit, sql, massredovisning (summary + CSV),
                      replyTemplates (inbox replies), inboxDemo (the DEMO_MODE mailbox), weeks, pricing,
                      fakturaunderlag (pure weekly builder), fortnoxPayload (draft invoice JSON)
  jobs/retention.js   01:30 nightly: delete photos and anonymise departed drivers past retention_months
  jobs/backup.js      02:00 nightly: VACUUM INTO + optional BACKUP_DIR mirror of the DB and photos
  seed/               demo.js (seedDemo) + run.js (CLI)
  tests/              vitest + supertest; in-memory SQLite
client/src/
  App.jsx             auth gate + route table
  components/         AppShell, Button, Dialog, Field, Link, PageHeader, Toast, AuthImage, LinkShare
  lib/                api (+ downloadFile), router (history API), useApi, useForm, labels (sv),
                      massPdf (jsPDF, loaded on demand), auth/toast contexts
  pages/              one file per page (Inbox + InboxThread /inkorg, LassQueue /lass, Massredovisning /massor,
                      Fakturaunderlag /faktura, PriceLists /prislistor, …)
  driver/             the driver page bundle (/f/:token)
```

## Hosting

- `deploy/README.md` is the runbook.
- `Dockerfile` (repo root) builds one image: the API plus the built client on one port.
- `deploy/compose.yaml` runs three services:
  - **`app`:** production, real customers. `DEMO_MODE` is forced to "0".
  - **`demo`:** fake data, `DEMO_MODE=1` with `DEMO_AUTO_RESET=1` (empty database → seeded; reseeds at 03:30), and blank API keys.
  - **`caddy`:** HTTPS.
- Secrets live only in `deploy/*.env` on the server (gitignored).
- Customer accounts: `deploy/account.sh` → `server/scripts/account.js` (`lib/accounts.js`). There is no sign-up page. Users change their password under Inställningar.
- `TRUST_PROXY=1` behind Caddy; the default `loopback` is for the Vite proxy.
- Don't add anything that only works on the server: everything still runs with `npm run dev` on a laptop.

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

- Both processes bind `HOST=0.0.0.0`, so a phone on the same Wi-Fi can open driver links. Set `PUBLIC_BASE_URL` to `http://<laptop-LAN-IP>:5173`. On Windows, allow Node.js through Windows Defender Firewall on private networks, or the phone can't connect.
- Every URL comes from env: `APP_URL`, `PUBLIC_BASE_URL`, `FORTNOX_REDIRECT_URI`, `VITE_API_TARGET`, and the `*_API_BASE` vars. Never hardcode `localhost` outside `.env.example`.
- Without `ELKS_*` credentials, SMS is simulated and logged to the console. Without `SMTP_HOST`/`MAIL_FROM`, order confirmation emails are simulated the same way (logged and stored, not sent). Without `ANTHROPIC_API_KEY`, the extraction endpoints return a clear error. **Never fall back to fake data.**
- The one exception is `DEMO_MODE=1` (owner decision, for showing prospects), refused in production. It does two things:
  - canned extractions for the built-in sample orders in `lib/orderDemo.js`, exact text match only, ignored when an API key is set. Don't extend it to other text or to vågsedel extraction.
  - one-click office login: an empty login form calls `POST /api/auth/demo-login`, which signs in the first active office user. The route only exists in demo mode; `GET /api/auth/demo` tells the login page.
  - the demo order mailbox: "Hämta ny post" delivers the next held-back email from `lib/inboxDemo.js`, and `POST /api/inbox/demo` adds the mailbox to an existing demo database. Outside demo mode nothing fetches mail.

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
  - working-day deadlines (Swedish holidays)
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

**Avstämning.**
- Matching is computed on every read (`lib/reconcile.js`, pure), never stored, so it follows later corrections. Only the office's decisions are stored on `weigh_list_rows`: lass created from the row, or ignored with a reason.
- A lass is only ever created or corrected from a row by a person clicking it. Corrections are new lass versions with the reason "Rättad enligt våglista från …"; an invoiced lass is never corrected.
- A lass created from a row stores `lass.weigh_list_row_id`; the row is its evidence, so "Inget foto på vågsedeln" doesn't apply to it.

**Lass records are append-only.** A correction writes a new row in `lass_versions` with `change_reason`; nothing is ever updated in place, and a DB trigger enforces this. Only the retention job may delete, and it logs to `audit_log` (today it keeps every lass).
- The office reviews in `/lass` (`routes/lass.js`). Approving writes a version with `review_status='granskad'`, and every uncertain value counts as checked by the office (`kontor`). A changed value always needs a `change_reason`.
- An office correction of a reviewed lass keeps it reviewed. A driver can't correct a lass once the office has reviewed it.
- A lass on an invoice line can't change (409 `invoiced`).

**Hazardous waste.** A lass with `farligt_avfall` must be reported to Naturvårdsverket's avfallsregister within two working days of the transport (`lib/workdays.js`: weekends, Swedish public holidays, midsommarafton, julafton, nyårsafton). The office records the report in `hazard_reports`; an undo sets `withdrawn_at` and never deletes the row.

**Massredovisning.** `GET /api/massredovisning?project_id&from&to` returns JSON; `&format=csv` returns UTF-8 with BOM, `;` separators, decimal comma and CRLF for Swedish Excel. CSV cells starting with `= + - @` are prefixed with `'` (formula injection). The PDF is built in the client (`lib/massPdf.js`) with Helvetica, so text is mapped to Latin-1.

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

**Fakturaunderlag (`/faktura`, `routes/fakturaunderlag.js`).** One underlag per customer + project and ISO week (D12), built by the pure `lib/fakturaunderlag.js`.
- **Prices** (`lib/pricing.js`) resolve project list → customer list → company default; the most specific item wins (uppdragstyp + material > uppdragstyp > material > generic, material matched by containment).
- **Billing basis:** the price unit of the job as a whole decides it. `ton`/`lass` bills each lass, `timme` bills each assignment-day from `time_entries` (newest row), and `fast` bills one line in the week the job starts.
- **Blockers** stop a project's underlag: `Ska granskas`, `Pris saknas`, `Vikt saknas`, `Timmar saknas`.
- **Two ways out, and every billed row is claimed by a unique `invoice_lines` row** (per lass, per assignment-day, per fixed job):
  - a Fortnox draft
  - "Lås underlag", for customers outside Fortnox (they get the PDF/CSV)
- **A failed Fortnox call** releases the rows and keeps the batch as `misslyckad`. On an unclear failure (timeout, 5xx) the route first looks the draft up by `ExternalInvoiceReference1`.
- **Voiding** (`makulerad`) releases the rows. A Fortnox draft must also be deleted in Fortnox, and the UI says so.
- **Price lists:** `/prislistor` (`routes/priceLists.js`); customers and projects pick one in their dialogs.

**Fortnox.**
- Create unbooked invoices only. Never call `bookkeep` or any send endpoint.
- Store the document number on the batch and claim each lass with a unique index so nothing is invoiced twice.
- Refresh tokens rotate on every use: refresh behind a lock, and on `invalid_grant` set `fortnox_status='reconnect_required'` and show a reconnect prompt.

**Order confirmation email.** Sent only when the office ticks it on the review page or clicks send on the job page; never automatically.
- Built by `lib/orderConfirmation.js` (pure: subject, text, HTML with inline styles, every value escaped) and sent by `services/mail.js` (never throws).
- Every attempt is stored in `order_confirmations` with the exact content and audited. Reply-To is the company email.
- A failed send never rolls back the job. Show the Swedish message from `MAIL_ERRORS`, never the SMTP error text.

**Order inbox (`/inkorg`, `routes/inbox.js`).** One read-only order mailbox per company (`mail_accounts`). Each incoming email is stored once per Message-ID, threaded by In-Reply-To, and sorted into `bestallning`, `andring`, `avbokning`, `fraga`, `svar` or `ovrigt` (filtered out), with `category_source` `regel` (cheap pre-filter, no AI), `ai` or `kontoret` (the office corrected it).
- Order emails carry an AI extraction in `ai_extractions`. "Granska och skapa uppdrag" turns it into an ordinary order intake, so the human-in-the-loop rules above apply unchanged. Confirming links the job back to the email.
- Changes and cancellations are linked to the job and shown. **Lasskoll never changes a job from an email**; the office does it.
- Replies come from `lib/replyTemplates.js` (pure, tested). The office edits them and sends them; nothing is sent automatically. They are threaded (In-Reply-To/References), quote the original, and are stored in `email_replies`. A `bekrafta` reply is the order confirmation and is also stored in `order_confirmations`.
- Real mailbox fetching (Microsoft Graph, Gmail, IMAP) and AI triage through `services/ai.js` are not built yet; `services/inbox.js` `ingest()` is where they plug in.

**46elks.** The sender ID is ≤11 characters, ASCII letters and digits only (`ELKS_SENDER`, default `Akaren`, no "Å").

**Security.**
- Secrets live only in env. The server refuses to start without `JWT_SECRET` (≥32 chars) and `ENCRYPTION_KEY`.
- Validate every request body with zod.
- Rate-limit login, the AI endpoints and the SMS endpoints.
- Return Swedish user-facing error messages; never send `err.message` to the client.

**Driver page (`/f/:token`, `client/src/driver/`).**
- It's a separate, lazy-loaded bundle for phones and must work with gloves, in bad light and with bad coverage: ≥56 px targets, 17 px+ text, no hover-only UI.
- It's served over plain HTTP on the LAN, so no secure-context APIs: use the `uuid()` helper rather than `crypto.randomUUID`, `<input type=file capture>` rather than `getUserMedia`, and no service worker.
- GETs go through `cachedGet` (offline fallback).
- Lass submits carry a `client_uuid` and go to the IndexedDB outbox on network failure; the server's `client_uuid` uniqueness makes retries idempotent.
- The magic-link token is random and only its SHA-256 is stored. Every driver request re-checks link expiry, revocation and that the driver is active.
- SMS text must stay GSM-7 safe (`gsmSafe`) and within two segments.

**Photos.**
- Every upload is re-encoded by `services/photos.js`: auto-rotated, ≤2000 px, JPEG, and all EXIF stripped, including GPS.
- Files are stored under random 128-bit ids in `DATA_DIR/photos`.
- They're served only through `/api/photos/:id` (office) or `/api/driver/photos/:id` (the uploading driver); the client uses `<AuthImage>`.

**UI gotcha.** Dialogs render in a portal on `<body>`. Never leave a `transform` on a page container: it becomes the containing block for `position: fixed` children.

**Personal data.**
- Driver phone numbers and photos are personal data.
- Photos get random 128-bit ids, are re-encoded with EXIF/GPS stripped, and are served only to the office or to the owning driver link.
- Retention defaults to 36 months (`companies.retention_months`). The nightly `jobs/retention.js` deletes vågsedel photos older than that (file removed, `photos.deleted_at` set) and anonymises inactive drivers with no assignments, lass or link use in the period. Every run is audited as `system`.
- The backup mirror (`BACKUP_DIR`) drops photos the retention job deleted, so a backup never outlives retention.
- Driver erasure anonymises the driver (`anonymizeDriver` in `jobs/retention.js`, reused by Phase 7's erase endpoint).

**Dependencies.** Don't add a new one without a reason. Prefer small in-house helpers (e.g. fuzzy matching, the router).
