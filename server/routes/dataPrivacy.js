import { Router }      from 'express';
import { randomBytes } from 'node:crypto';
import db              from '../db.js';
import { restoreBackup } from '../jobs/backup.js';

const router = Router();

// ── DPA version & full text ───────────────────────────────────────────────────
export const DPA_VERSION = '2026-05-v1';

export const DPA_TEXT = `PERSONUPPGIFTSBITRÄDESAVTAL (PUB-AVTAL)
Version ${DPA_VERSION} · Ikraftträdande 2026-05-16

DATA PROCESSING AGREEMENT (DPA)
Version ${DPA_VERSION} · Effective 2026-05-16

═══════════════════════════════════════════════════════════════

PARTER / PARTIES

Personuppgiftsansvarig (Controller):
Det företag som ingått avtal om användning av Åkaren-plattformen
("Kunden" / "the Customer")

Personuppgiftsbiträde (Processor):
Åkaren · Stockholms Åkeri AB
Organisationsnummer: [registreras vid avtalstecknande]
("Biträdet" / "the Processor")

═══════════════════════════════════════════════════════════════

1. BAKGRUND OCH SYFTE / BACKGROUND AND PURPOSE

1.1 Biträdet tillhandahåller en plattform för transporthantering,
offertskapande och flottadministration ("Tjänsten").

1.2 I samband med Tjänsten behandlar Biträdet personuppgifter för
Kundens räkning. Detta avtal reglerar den behandlingen i enlighet
med Europaparlamentets och rådets förordning (EU) 2016/679
("GDPR") artikel 28.

1.3 The Processor provides a transport management platform
("the Service"). In connection with the Service, the Processor
processes personal data on behalf of the Customer. This agreement
governs that processing in accordance with GDPR Article 28.

═══════════════════════════════════════════════════════════════

2. DEFINITIONER / DEFINITIONS

"Personuppgifter" avser alla uppgifter som definieras i GDPR art. 4(1).
"Personal data" means any data as defined in GDPR Art. 4(1).

"Behandling" avser varje åtgärd som vidtas med personuppgifter.
"Processing" means any operation performed on personal data.

"Registrerade" avser de fysiska personer vars uppgifter behandlas.
"Data subjects" means the natural persons whose data is processed.

═══════════════════════════════════════════════════════════════

3. BEHANDLINGENS SYFTE OCH ART / PURPOSE AND NATURE

3.1 Biträdet behandlar personuppgifter uteslutande för att:
    (a) Tillhandahålla Tjänsten enligt Kundens instruktioner
    (b) Skapa och hantera transportoffertar
    (c) Hantera förare, fordon och uppdrag
    (d) Generera fakturor och rapporter
    (e) Säkerhetskopiera data enligt detta avtal

3.2 The Processor processes personal data solely to:
    (a) Provide the Service per Customer instructions
    (b) Create and manage transport quotes
    (c) Manage drivers, vehicles and jobs
    (d) Generate invoices and reports
    (e) Back up data under this agreement

═══════════════════════════════════════════════════════════════

4. KATEGORIER AV PERSONUPPGIFTER / CATEGORIES OF PERSONAL DATA

4.1 Kontaktuppgifter: namn, e-post, telefon (förare, kunder)
    Contact data: name, email, phone (drivers, customers)

4.2 Affärsuppgifter: adresser, priser, transportrutter
    Business data: addresses, prices, transport routes

4.3 Tekniska uppgifter: IP-adresser, inloggningstider
    Technical data: IP addresses, login timestamps

4.4 Tolkningsdata: offertförfrågningar (kan innehålla namn)
    Parsing data: quote inquiries (may contain names)

═══════════════════════════════════════════════════════════════

5. BITRÄDETS SKYLDIGHETER / PROCESSOR OBLIGATIONS

5.1 Biträdet ska:
    (a) Behandla uppgifter enbart enligt Kundens dokumenterade instruktioner
    (b) Säkerställa att personal som behandlar uppgifter undertecknat sekretessförbindelser
    (c) Vidta tekniska och organisatoriska säkerhetsåtgärder (art. 32)
    (d) Utan onödigt dröjsmål underrätta Kunden om personuppgiftsincidenter
    (e) Bistå Kunden vid utövande av registrerades rättigheter
    (f) Radera eller återlämna uppgifter vid avtalets upphörande
    (g) Tillhandahålla information för granskning och revision

5.2 The Processor shall:
    (a) Process data only per Customer's documented instructions
    (b) Ensure personnel with data access are bound by confidentiality
    (c) Implement technical and organisational security measures (Art. 32)
    (d) Notify Customer of personal data breaches without undue delay
    (e) Assist Customer in honouring data subject rights
    (f) Delete or return data upon termination
    (g) Provide information for audits and inspections

═══════════════════════════════════════════════════════════════

6. SÄKERHETSÅTGÄRDER / SECURITY MEASURES

6.1 Tekniska åtgärder / Technical measures:
    · AES-256-GCM kryptering av säkerhetskopior
      AES-256-GCM encryption of backups
    · TLS 1.3 för all dataöverföring
      TLS 1.3 for all data transfer
    · Lösenordshashning med bcrypt (work factor ≥ 10)
      Password hashing with bcrypt (work factor ≥ 10)
    · JWT-baserad autentisering med begränsad livslängd
      JWT-based authentication with limited lifetime
    · Revisionsspår för alla dataändringar
      Audit trail for all data mutations
    · Automatisk säkerhetskopiering med 30 dagars retention
      Automated backups with 30-day retention

6.2 Organisatoriska åtgärder / Organisational measures:
    · Rollbaserad åtkomstkontroll (ägare / handläggare)
      Role-based access control (owner / dispatcher)
    · Hyresgästisolering — företagsdata delas aldrig
      Tenant isolation — company data never shared
    · Personuppgiftsincidentprocedur dokumenterad
      Personal data breach procedure documented

═══════════════════════════════════════════════════════════════

7. UNDERBITRÄDEN / SUB-PROCESSORS

7.1 Godkända underbiträden vid tidpunkten för detta avtal:
    Approved sub-processors at the time of this agreement:

    · Underleverantör för textbearbetning / Text processing sub-processor
      (USA — Standard Contractual Clauses tillämpas)
    · Amazon Web Services / S3-kompatibel lagring — Säkerhetskopior
      (EU-region när tillgänglig / EU region when available)
    · 46elks AB — SMS-notifikationer till förare (Sverige)
      SMS notifications to drivers (Sweden)

7.2 Biträdet ska meddela Kunden om ändringar i underbiträdeslistan
    med minst 30 dagars varsel.
    The Processor shall notify Customer of changes to sub-processors
    with at least 30 days' notice.

═══════════════════════════════════════════════════════════════

8. REGISTRERADES RÄTTIGHETER / DATA SUBJECT RIGHTS

8.1 Biträdet bistår Kunden att tillgodose begäranden om:
    The Processor assists Customer in fulfilling requests for:
    · Tillgång / Access (art. 15)
    · Rättelse / Rectification (art. 16)
    · Radering / Erasure (art. 17)
    · Begränsning / Restriction (art. 18)
    · Dataportabilitet / Data portability (art. 20)
    · Invändning / Objection (art. 21)

8.2 GDPR-export tillhandahålls via Inställningar → Data & Integritet
    i plattformen. Svar lämnas inom 30 dagar.
    GDPR export is available via Settings → Data & Privacy
    in the platform. Responses provided within 30 days.

═══════════════════════════════════════════════════════════════

9. INCIDENTHANTERING / INCIDENT MANAGEMENT

9.1 Vid personuppgiftsincident underrättar Biträdet Kunden inom
    72 timmar med uppgift om:
    · Incidentens art
    · Berörd data och registrerade
    · Sannolika konsekvenser
    · Vidtagna åtgärder

9.2 In case of a personal data breach the Processor notifies
    the Customer within 72 hours with details of:
    · Nature of the breach
    · Affected data and data subjects
    · Likely consequences
    · Measures taken

═══════════════════════════════════════════════════════════════

10. LAGRINGSPERIOD OCH RADERING / RETENTION AND DELETION

10.1 Aktivt konto / Active account:
     Personuppgifter lagras under avtalets löptid.
     Personal data stored for the duration of the agreement.

10.2 Vid uppsägning / Upon termination:
     Kunden kan begära fullständig export (art. 20) och radering.
     Customer may request full export (Art. 20) and deletion.
     Radering verkställs inom 30 dagar från begäran.
     Deletion executed within 30 days of request.

10.3 Säkerhetskopior / Backups:
     Dagliga kopior: 30 dagar retention / Daily copies: 30-day retention
     Månatliga kopior: 12 månader retention / Monthly: 12-month retention

═══════════════════════════════════════════════════════════════

11. GILTIGHETSTID / DURATION

11.1 Avtalet gäller så länge Kunden nyttjar Tjänsten.
     Agreement is valid for the duration of Service use.

11.2 Biträdets förpliktelser avseende sekretess och radering
     kvarstår efter avtalets upphörande.
     Processor obligations regarding confidentiality and deletion
     survive termination.

═══════════════════════════════════════════════════════════════

12. TILLÄMPLIG LAG / GOVERNING LAW

Svensk lag. Tvist avgörs av Stockholms tingsrätt.
Swedish law. Disputes resolved by Stockholm District Court.

═══════════════════════════════════════════════════════════════

Genom att klicka "Jag accepterar" / "I Accept" bekräftar du att
du har läst, förstått och godkänt detta avtal på uppdrag av ditt
företag, och att du har behörighet att ingå avtal för företagets räkning.

By clicking "I Accept" you confirm that you have read, understood
and agreed to this agreement on behalf of your company, and that
you have authority to bind the company.
`;

// ── GET /dpa ─ return DPA text + whether this company has accepted ────────────
router.get('/dpa', (req, res) => {
  const accepted = db.prepare(
    'SELECT accepted_at FROM dpa_acceptances WHERE company_id = ? AND dpa_version = ?'
  ).get(req.companyId, DPA_VERSION);
  res.json({ version: DPA_VERSION, accepted: Boolean(accepted), accepted_at: accepted?.accepted_at ?? null, text: DPA_TEXT });
});

// ── POST /dpa/accept ──────────────────────────────────────────────────────────
router.post('/dpa/accept', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress;
  try {
    db.prepare(`
      INSERT OR IGNORE INTO dpa_acceptances (company_id, user_id, dpa_version, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(req.companyId, req.user.userId, DPA_VERSION, ip);
    const acceptedAt = new Date().toISOString();
    db.prepare(`UPDATE companies SET dpa_accepted_at = ? WHERE id = ?`).run(acceptedAt, req.companyId);
    // Audit
    db.prepare(`INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, ip_address)
                VALUES (?, ?, 'dpa', ?, 'accept', ?)`
    ).run(req.companyId, req.user.userId, DPA_VERSION, ip);
    res.json({ ok: true, dpa_accepted_at: acceptedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /export ─ GDPR data portability export (JSON) ────────────────────────
router.get('/export', (req, res) => {
  const cid = req.companyId;
  try {
    const company   = db.prepare('SELECT id,name,org_nr,address,phone,email,created_at FROM companies WHERE id = ?').get(cid);
    const users     = db.prepare('SELECT id,name,email,role,last_login FROM users WHERE company_id = ?').all(cid);
    const quotes    = db.prepare('SELECT * FROM quotes WHERE company_id = ?').all(cid);
    const jobs      = db.prepare('SELECT * FROM jobs WHERE company_id = ?').all(cid);
    const drivers   = db.prepare('SELECT * FROM drivers WHERE company_id = ?').all(cid);
    const templates = db.prepare('SELECT * FROM templates WHERE company_id = ?').all(cid);
    const customers = db.prepare('SELECT * FROM customers WHERE company_id = ?').all(cid);
    const invoices  = db.prepare('SELECT * FROM invoices WHERE company_id = ?').all(cid);
    const audit     = db.prepare('SELECT id,entity_type,entity_id,action,created_at FROM audit_log WHERE company_id = ? ORDER BY created_at DESC LIMIT 1000').all(cid);

    const payload = {
      exported_at:     new Date().toISOString(),
      gdpr_basis:      'GDPR Article 20 — Right to data portability',
      company,
      users,
      quotes,
      jobs,
      drivers,
      templates,
      customers,
      invoices,
      audit_log: audit,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="akaren-export-${cid}-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /export/csv ─ quotes as CSV ──────────────────────────────────────────
router.get('/export/csv', (req, res) => {
  const quotes = db.prepare('SELECT * FROM quotes WHERE company_id = ?').all(req.companyId);
  const cols   = ['id','lasttyp','upphämtning','leverans','datum','fordon_id','avstand_km','totalpris_sek','status','created_at'];
  const header = cols.join(',');
  const rows   = quotes.map((q) =>
    cols.map((c) => {
      const v = q[c] ?? '';
      return typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')
  );
  const csv = [header, ...rows].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="akaren-quotes-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send('﻿' + csv); // BOM for Excel
});

// ── GET /backups ─ backup history (last 30) ───────────────────────────────────
router.get('/backups', (req, res) => {
  const rows = db.prepare(`
    SELECT id, backup_type, s3_key, size_bytes, encrypted, status, error, created_at
    FROM backups
    ORDER BY created_at DESC LIMIT 30
  `).all();
  res.json(rows);
});

// ── POST /backups/:id/restore/request ─ initiate restore with token ───────────
router.post('/backups/:id/restore/request', (req, res) => {
  const backup = db.prepare('SELECT * FROM backups WHERE id = ?').get(req.params.id);
  if (!backup) return res.status(404).json({ error: 'Backup not found' });

  const token     = randomBytes(4).toString('hex').toUpperCase(); // 8-char code
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

  db.prepare(`
    INSERT INTO restore_tokens (company_id, backup_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(req.companyId, backup.id, token, expiresAt);

  // Audit the request
  db.prepare(`INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, after_value)
              VALUES (?, ?, 'backup', ?, 'restore_requested', ?)`
  ).run(req.companyId, req.user.userId, String(backup.id), JSON.stringify({ s3_key: backup.s3_key }));

  res.json({ token, expires_at: expiresAt, backup_date: backup.created_at });
});

// ── POST /backups/:id/restore/confirm ─ execute restore after code confirm ────
router.post('/backups/:id/restore/confirm', async (req, res) => {
  const { token } = req.body;
  const record = db.prepare(`
    SELECT * FROM restore_tokens
    WHERE backup_id = ? AND token = ? AND used = 0 AND expires_at > datetime('now')
  `).get(req.params.id, token);

  if (!record) return res.status(400).json({ error: 'Invalid or expired confirmation code' });

  try {
    const pendingPath = await restoreBackup(Number(req.params.id));
    db.prepare('UPDATE restore_tokens SET used = 1 WHERE id = ?').run(record.id);
    db.prepare(`INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, after_value)
                VALUES (?, ?, 'backup', ?, 'restore_confirmed', ?)`
    ).run(req.companyId, req.user.userId, req.params.id, JSON.stringify({ pending: pendingPath }));
    res.json({ ok: true, message: 'Restore prepared. Server restart required to apply.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /delete-account ─ 30-day soft delete request ────────────────────────
router.post('/delete-account', (req, res) => {
  const existing = db.prepare(
    "SELECT id FROM deletion_requests WHERE company_id = ? AND status = 'pending'"
  ).get(req.companyId);
  if (existing) return res.status(409).json({ error: 'Pending deletion request already exists' });

  const hardDeleteAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const ip = req.headers['x-forwarded-for']?.split(',')[0] ?? req.socket.remoteAddress;

  db.prepare(`
    INSERT INTO deletion_requests (company_id, requested_by, hard_delete_at)
    VALUES (?, ?, ?)
  `).run(req.companyId, req.user.userId, hardDeleteAt);

  db.prepare(`INSERT INTO audit_log (company_id, user_id, entity_type, action, after_value, ip_address)
              VALUES (?, ?, 'company', 'delete_requested', ?, ?)`
  ).run(req.companyId, req.user.userId, JSON.stringify({ hard_delete_at: hardDeleteAt }), ip);

  res.json({ ok: true, hard_delete_at: hardDeleteAt });
});

// ── DELETE /delete-account ─ cancel pending deletion ─────────────────────────
router.delete('/delete-account', (req, res) => {
  const result = db.prepare(`
    UPDATE deletion_requests SET status = 'cancelled'
    WHERE company_id = ? AND status = 'pending'
  `).run(req.companyId);
  if (result.changes === 0) return res.status(404).json({ error: 'No pending deletion request' });
  db.prepare(`INSERT INTO audit_log (company_id, user_id, entity_type, action)
              VALUES (?, ?, 'company', 'delete_cancelled')`
  ).run(req.companyId, req.user.userId);
  res.json({ ok: true });
});

// ── GET /delete-account ─ check if pending deletion exists ───────────────────
router.get('/delete-account', (req, res) => {
  const req2 = db.prepare(
    "SELECT * FROM deletion_requests WHERE company_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1"
  ).get(req.companyId);
  res.json(req2 ?? null);
});

// ── GET /export-all — GDPR data portability export ───────────────────────────
router.get('/export-all', (req, res) => {
  try {
    const cid = req.companyId;
    const company  = db.prepare(`SELECT id, name, org_nr, address, phone, email, brand_color, bankgiro, created_at FROM companies WHERE id = ?`).get(cid);
    const users    = db.prepare(`SELECT id, name, email, role, active, last_login, created_at FROM users WHERE company_id = ?`).all(cid);
    const quotes   = db.prepare(`SELECT * FROM quotes   WHERE company_id = ? ORDER BY created_at DESC`).all(cid);
    const jobs     = db.prepare(`SELECT * FROM jobs     WHERE company_id = ? ORDER BY created_at DESC`).all(cid);
    const drivers  = db.prepare(`SELECT * FROM drivers  WHERE company_id = ?`).all(cid);
    const fleet    = db.prepare(`SELECT * FROM company_fleet WHERE company_id = ?`).all(cid);
    const invoices = db.prepare(`SELECT * FROM invoices WHERE company_id = ? ORDER BY created_at DESC`).all(cid);
    const customers = db.prepare(`SELECT * FROM customers WHERE company_id = ?`).all(cid);
    const templates = db.prepare(`SELECT * FROM templates WHERE company_id = ?`).all(cid);
    const auditLog  = db.prepare(
      `SELECT id, entity_type, entity_id, action, ip_address, created_at,
              COALESCE(al.user_name, u.name) AS user_name
       FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
       WHERE al.company_id = ? ORDER BY al.created_at DESC LIMIT 5000`
    ).all(cid);

    const payload = {
      exported_at: new Date().toISOString(),
      company,
      users,
      quotes,
      jobs,
      drivers,
      fleet,
      invoices,
      customers,
      templates,
      audit_log: auditLog,
    };

    const filename = `akaren-export-${company?.name?.replace(/[^a-z0-9]/gi, '_') ?? cid}-${new Date().toISOString().slice(0,10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
