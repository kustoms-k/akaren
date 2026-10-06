import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest, conflict, idParam, notFound, validate } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { addDays, isoWeekday, stockholmDate } from '../lib/dates.js';
import { date, optionalText } from '../lib/schemas.js';
import { confidentPick, suggestMatches } from '../lib/match.js';
import { MAIL_ERRORS } from '../lib/orderConfirmation.js';
import { demoIngestArgs } from '../lib/inboxDemo.js';
import {
  DECLINE_REASONS, INFO_QUESTIONS, REPLY_TEMPLATES, TEMPLATES_FOR, buildReply, quoteOriginal, relevantDetails, replyHtml, suggestQuestions,
} from '../lib/replyTemplates.js';
import { createInboxStore, intakeText } from '../services/inbox.js';
import { nextDemoEmail, seedInbox } from '../seed/inbox.js';

export const CATEGORIES = ['bestallning', 'andring', 'avbokning', 'fraga', 'svar', 'ovrigt'];
const ORDER_SOURCES = ['bestallning', 'svar', 'fraga'];
const TABS = ['att_hantera', 'order', 'bortsorterat'];
// Fields worth asking about when the AI couldn't find them, in the order the AI card lists them.
const KEY_FIELDS = ['datum', 'tid', 'adress', 'material', 'fran', 'till', 'telefon'];

const time = z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ange tid som TT:MM.').nullable().optional());
const paramsSchema = z.object({
  datum: date.optional(),
  tid: time,
  questions: z.array(z.enum(Object.keys(INFO_QUESTIONS))).max(12).optional(),
  reason: z.enum(Object.keys(DECLINE_REASONS)).optional(),
  note: optionalText(1000),
  message: optionalText(1000),
}).strict();
const previewSchema = z.object({ template: z.enum(REPLY_TEMPLATES), params: paramsSchema.default({}) }).strict();
const sendSchema = z.object({
  template: z.enum(REPLY_TEMPLATES),
  params: paramsSchema.default({}),
  to: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.email({ error: 'Ange en giltig e-postadress.' }).max(320)),
  cc: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.email('Ogiltig e-postadress.').max(320).nullable().optional()),
  subject: z.string().trim().min(1, 'Skriv ett ämne.').max(300, 'Högst 300 tecken.'),
  text: z.string().trim().max(10_000, 'Högst 10 000 tecken.').optional(),
}).strict();

const parse = (json, fallback) => { try { return json ? JSON.parse(json) : fallback; } catch { return fallback; } };
/** The body without the quoted original, for list snippets. */
const ownText = (body) => String(body ?? '').split(/\n(?:>|Den .{6,60} skrev )/)[0].trim();
const snippet = (body) => ownText(body).replace(/\s+/g, ' ').slice(0, 160);
const nextWorkday = (d) => { let x = addDays(d, 1); while (isoWeekday(x) > 5) x = addDays(x, 1); return x; };

/**
 * The order inbox (/inkorg): threads from the connected order mailbox, sorted into order mail and the rest,
 * with the AI's reading of each order and pre-written replies. Replies are only ever sent by the office.
 */
export function inboxRouter({ db, config, audit, mail, limiters }) {
  const router = Router();
  const store = createInboxStore({ db });
  const demoDelayMs = config.isTest ? 0 : 1400;

  const stmt = {
    account: db.prepare('SELECT * FROM mail_accounts WHERE company_id = ?'),
    company: db.prepare('SELECT * FROM companies WHERE id = ?'),
    recent: db.prepare(`
      SELECT e.id, e.thread_id, e.from_name, e.from_email, e.subject, substr(e.body_text, 1, 600) AS body, e.received_at,
             e.category, e.summary, e.filter_reason, e.flags_json, e.job_id, e.order_intake_id, e.ai_extraction_id,
             e.read_at, e.handled_at, (SELECT COUNT(*) FROM inbound_attachments a WHERE a.email_id = e.id) AS attachments
      FROM inbound_emails e WHERE e.company_id = ? ORDER BY e.received_at DESC LIMIT 1000`),
    recentReplies: db.prepare(`
      SELECT thread_id, MAX(created_at) AS last_at, COUNT(*) AS n,
             (SELECT substr(body_text, 1, 300) FROM email_replies r2 WHERE r2.company_id = r.company_id AND r2.thread_id = r.thread_id
              ORDER BY created_at DESC LIMIT 1) AS body
      FROM email_replies r WHERE company_id = ? GROUP BY thread_id`),
    threadEmails: db.prepare('SELECT * FROM inbound_emails WHERE company_id = ? AND thread_id = ? ORDER BY received_at, id'),
    threadReplies: db.prepare(`
      SELECT r.*, u.name AS sent_by_name FROM email_replies r LEFT JOIN users u ON u.id = r.sent_by_user_id
      WHERE r.company_id = ? AND r.thread_id = ? ORDER BY r.created_at, r.id`),
    attachments: db.prepare('SELECT id, email_id, filename, content_type, size_bytes, text_content IS NOT NULL AS has_text FROM inbound_attachments WHERE company_id = ? AND email_id = ?'),
    attachmentTexts: db.prepare('SELECT filename, text_content FROM inbound_attachments WHERE company_id = ? AND email_id = ?'),
    attachment: db.prepare('SELECT * FROM inbound_attachments WHERE id = ? AND company_id = ?'),
    email: db.prepare('SELECT * FROM inbound_emails WHERE id = ? AND company_id = ?'),
    extraction: db.prepare('SELECT fields_json, model FROM ai_extractions WHERE id = ? AND company_id = ?'),
    intake: db.prepare('SELECT id, status, job_id FROM order_intakes WHERE id = ? AND company_id = ?'),
    customers: db.prepare('SELECT id, name, org_nr, email FROM customers WHERE company_id = ? AND active = 1'),
    projects: db.prepare(`
      SELECT p.id, p.name, p.customer_id, p.address, p.customer_ref, p.miljozon, c.name AS customer_name
      FROM projects p JOIN customers c ON c.id = p.customer_id WHERE p.company_id = ? AND p.active = 1`),
    // Addresses we've already dealt with for a customer: job contacts and confirmation recipients.
    knownSenders: db.prepare(`
      SELECT lower(epost) AS email, customer_id FROM jobs WHERE company_id = @cid AND epost IS NOT NULL
      UNION SELECT lower(oc.to_email), j.customer_id FROM order_confirmations oc JOIN jobs j ON j.id = oc.job_id WHERE oc.company_id = @cid`),
    job: db.prepare(`
      SELECT j.*, c.name AS customer_name, c.org_nr AS customer_org_nr,
             p.name AS project_name, p.address AS project_address, p.postnr AS project_postnr, p.ort AS project_ort, p.customer_ref
      FROM jobs j JOIN customers c ON c.id = j.customer_id JOIN projects p ON p.id = j.project_id
      WHERE j.id = ? AND j.company_id = ?`),
    insertIntake: db.prepare('INSERT INTO order_intakes (company_id, raw_text, ai_extraction_id, created_by_user_id) VALUES (?, ?, ?, ?)'),
    linkIntake: db.prepare('UPDATE inbound_emails SET order_intake_id = ?, read_at = COALESCE(read_at, ?) WHERE id = ? AND company_id = ?'),
    markRead: db.prepare('UPDATE inbound_emails SET read_at = ? WHERE company_id = ? AND thread_id = ? AND read_at IS NULL'),
    markDone: db.prepare(`
      UPDATE inbound_emails SET handled_at = @at, handled_by_user_id = @uid, read_at = COALESCE(read_at, @at)
      WHERE company_id = @cid AND thread_id = @tid AND handled_at IS NULL`),
    reopen: db.prepare('UPDATE inbound_emails SET handled_at = NULL, handled_by_user_id = NULL WHERE id = ? AND company_id = ?'),
    setCategory: db.prepare(`
      UPDATE inbound_emails SET category = ?, category_source = 'kontoret', filter_reason = ?, handled_at = NULL
      WHERE id = ? AND company_id = ?`),
    touchSync: db.prepare('UPDATE mail_accounts SET last_sync_at = ? WHERE id = ?'),
  };

  const accountView = (a) => a && ({ id: a.id, provider: a.provider, address: a.address, folder: a.folder, status: a.status, last_sync_at: a.last_sync_at });

  /** Customer matching for a request: who is this sender, as far as we already know? */
  function matcher(companyId) {
    const customers = stmt.customers.all(companyId);
    const projects = stmt.projects.all(companyId);
    const known = new Map(stmt.knownSenders.all({ cid: companyId }).map((r) => [r.email, r.customer_id]));
    const byId = new Map(customers.map((c) => [c.id, c]));
    return {
      customers, projects,
      /** { customer, project, how } or null. fields: an extraction, if there is one. */
      match(fromEmail, body, fields = null) {
        const exact = known.get(String(fromEmail).toLowerCase()) ?? customers.find((c) => c.email?.toLowerCase() === fromEmail)?.id;
        const s = suggestMatches({ customers, projects, fields: fields ?? {}, rawText: `Från: ${fromEmail}\n${body}` });
        const pick = exact ? byId.get(exact) : confidentPick(s.customers);
        if (!pick) return null;
        const project = confidentPick(s.projects.filter((p) => p.customer_id === pick.id));
        return {
          customer: { id: pick.id, name: pick.name },
          project: project ? { id: project.id, name: project.name } : null,
          reasons: exact ? ['Känd avsändare'] : s.customers.find((c) => c.id === pick.id)?.reasons ?? [],
        };
      },
    };
  }

  function requireAccount(req) {
    const account = stmt.account.get(req.companyId);
    if (!account) throw conflict('no_mailbox', 'Ingen e-post är kopplad till inkorgen än.');
    return account;
  }

  function loadEmail(req, id = req.params.id) {
    const email = stmt.email.get(idParam(id), req.companyId);
    if (!email) throw notFound('Mejlet finns inte.');
    return email;
  }

  function extractionOf(email, companyId) {
    if (!email?.ai_extraction_id) return null;
    const row = stmt.extraction.get(email.ai_extraction_id, companyId);
    if (!row) return null;
    const { fields = {}, warnings = [] } = parse(row.fields_json, {});
    return { fields, warnings, model: row.model };
  }

  // ── Threads ──

  function buildThreads(companyId) {
    const m = matcher(companyId);
    const replies = new Map(stmt.recentReplies.all(companyId).map((r) => [r.thread_id, r]));
    const byThread = new Map();
    for (const e of stmt.recent.all(companyId)) {
      if (!byThread.has(e.thread_id)) byThread.set(e.thread_id, []);
      byThread.get(e.thread_id).push(e);
    }
    const threads = [];
    for (const [threadId, list] of byThread) {
      const emails = list.slice().reverse();                 // oldest first
      const latest = emails[emails.length - 1];
      const orderMail = emails.filter((e) => e.category !== 'ovrigt');
      const focus = orderMail[orderMail.length - 1] ?? latest;
      const out = replies.get(threadId);
      const open = orderMail.filter((e) => !e.handled_at).length;
      const lastIsOurs = out && out.last_at > latest.received_at;
      const flags = [...new Set(emails.flatMap((e) => parse(e.flags_json, [])))];
      const match = orderMail.length ? m.match(focus.from_email, focus.body) : null;
      threads.push({
        id: threadId,
        subject: emails[0].subject,
        from_name: latest.from_name,
        from_email: latest.from_email,
        category: focus.category,
        summary: focus.summary,
        filter_reason: focus.category === 'ovrigt' ? focus.filter_reason : null,
        snippet: lastIsOurs ? `Du: ${snippet(out.body)}` : snippet(latest.body),
        last_at: lastIsOurs ? out.last_at : latest.received_at,
        count: emails.length + (out?.n ?? 0),
        unread: emails.some((e) => !e.read_at),
        attachments: emails.some((e) => e.attachments > 0),
        status: !orderMail.length ? 'sorterad' : open ? 'ny' : lastIsOurs ? 'besvarad' : 'klar',
        order: orderMail.length > 0,
        flags,
        job_id: emails.find((e) => e.job_id)?.job_id ?? null,
        customer: match?.customer ?? null,
      });
    }
    return threads.sort((a, b) => b.last_at.localeCompare(a.last_at));
  }

  router.get('/', (req, res) => {
    const account = stmt.account.get(req.companyId);
    if (!account) return res.json({ account: null, demo_available: config.demoMode, counts: null, threads: [] });
    const tab = TABS.includes(req.query.flik) ? req.query.flik : 'att_hantera';
    const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
    const all = buildThreads(req.companyId);
    const today = stockholmDate();
    const inTab = all.filter((t) => (tab === 'bortsorterat' ? !t.order : tab === 'order' ? t.order : t.order && t.status === 'ny'));
    const hits = q
      ? inTab.filter((t) => [t.subject, t.from_name, t.from_email, t.snippet, t.customer?.name, t.summary].some((s) => s?.toLowerCase().includes(q)))
      : inTab;
    res.json({
      account: accountView(account),
      demo: account.provider === 'demo',
      counts: {
        att_hantera: all.filter((t) => t.order && t.status === 'ny').length,
        order: all.filter((t) => t.order).length,
        bortsorterat: all.filter((t) => !t.order).length,
        today: {
          order: all.filter((t) => t.order && stockholmDate(new Date(t.last_at)) === today).length,
          bortsorterat: all.filter((t) => !t.order && stockholmDate(new Date(t.last_at)) === today).length,
        },
      },
      threads: hits,
    });
  });

  router.get('/summary', (req, res) => {
    if (!stmt.account.get(req.companyId)) return res.json({ connected: false, att_hantera: 0, unread: 0 });
    const threads = buildThreads(req.companyId).filter((t) => t.order);
    res.json({
      connected: true,
      att_hantera: threads.filter((t) => t.status === 'ny').length,
      unread: threads.filter((t) => t.unread).length,
    });
  });

  router.get('/threads/:id', (req, res) => {
    const threadId = idParam(req.params.id);
    const account = requireAccount(req);
    const emails = stmt.threadEmails.all(req.companyId, threadId);
    if (!emails.length) throw notFound('Mejlet finns inte.');
    const replies = stmt.threadReplies.all(req.companyId, threadId);

    const orderMail = emails.filter((e) => e.category !== 'ovrigt');
    const focus = orderMail[orderMail.length - 1] ?? emails[emails.length - 1];
    // The email an order is created from: the latest order, answer or question in the thread.
    const source = [...emails].reverse().find((e) => ORDER_SOURCES.includes(e.category)) ?? null;
    const extraction = extractionOf(source, req.companyId);
    const intake = source?.order_intake_id ? stmt.intake.get(source.order_intake_id, req.companyId) : null;
    const jobId = emails.find((e) => e.job_id)?.job_id ?? intake?.job_id ?? null;
    const job = jobId ? stmt.job.get(jobId, req.companyId) : null;
    const m = matcher(req.companyId);
    const match = job
      ? { customer: { id: job.customer_id, name: job.customer_name }, project: { id: job.project_id, name: job.project_name }, reasons: ['Gäller ett befintligt uppdrag'] }
      : focus.category !== 'ovrigt' ? m.match(focus.from_email, focus.body_text, extraction?.fields) : null;

    const fields = extraction?.fields ?? {};
    const wanted = fields.datum?.value;
    const lastOut = replies[replies.length - 1];
    const open = orderMail.some((e) => !e.handled_at);
    const messages = [
      ...emails.map((e) => ({
        kind: 'in', id: e.id, at: e.received_at, from_name: e.from_name, from_email: e.from_email, to_email: e.to_email,
        cc: e.cc, subject: e.subject, body_text: e.body_text, category: e.category, category_source: e.category_source,
        summary: e.summary, filter_reason: e.filter_reason, flags: parse(e.flags_json, []), change: parse(e.change_json, []),
        read: Boolean(e.read_at), handled: Boolean(e.handled_at),
        attachments: stmt.attachments.all(req.companyId, e.id).map((a) => ({ ...a, has_text: Boolean(a.has_text) })),
      })),
      ...replies.map((r) => ({
        kind: 'out', id: r.id, at: r.created_at, template: r.template, from_email: r.from_email, to_email: r.to_email,
        cc: r.cc_email, subject: r.subject, body_text: r.body_text, body_html: r.template === 'bekrafta' ? r.body_html : null,
        status: r.status, error_message: r.error ? MAIL_ERRORS[r.error] ?? MAIL_ERRORS.other : null, sent_by_name: r.sent_by_name,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));

    res.json({
      id: threadId,
      subject: emails[0].subject,
      account: accountView(account),
      company_name: stmt.company.get(req.companyId).name,
      mail_enabled: mail.enabled,
      status: !orderMail.length ? 'sorterad' : open ? 'ny' : lastOut && lastOut.created_at > emails[emails.length - 1].received_at ? 'besvarad' : 'klar',
      focus_id: focus.id,
      source_id: source?.id ?? null,
      triage: {
        category: focus.category, source: focus.category_source, summary: focus.summary, filter_reason: focus.filter_reason,
        flags: [...new Set(emails.flatMap((e) => parse(e.flags_json, [])))], change: parse(focus.change_json, []),
      },
      extraction: extraction && {
        ...extraction,
        missing: KEY_FIELDS.filter((k) => (relevantDetails(fields.uppdragstyp?.value)[k] ?? true) && (!fields[k] || fields[k].value == null)),
        email_id: source.id,
      },
      match,
      job: job && {
        id: job.id, status: job.status, project_name: job.project_name, customer_name: job.customer_name,
        datum_fran: job.datum_fran, datum_till: job.datum_till, tid: job.tid, uppdragstyp: job.uppdragstyp,
      },
      intake,
      messages,
      reply_to: focus.id,
      templates: (TEMPLATES_FOR[focus.category] ?? ['fritt']).map((key) => ({
        key, disabled_reason: key === 'bekrafta' && !job ? 'Skapa uppdraget först, så blir bekräftelsen komplett.' : null,
      })),
      questions: suggestQuestions(fields),
      defaults: {
        datum: wanted ? nextWorkday(wanted) : nextWorkday(stockholmDate()),
        tid: fields.tid?.value ?? '07:00',
        to: focus.from_email,
      },
    });
  });

  router.post('/threads/:id/read', (req, res) => {
    const n = stmt.markRead.run(new Date().toISOString(), req.companyId, idParam(req.params.id)).changes;
    res.json({ updated: n });
  });

  router.post('/threads/:id/status', (req, res) => {
    const threadId = idParam(req.params.id);
    const { done } = validate(z.object({ done: z.boolean() }).strict(), req.body);
    const emails = stmt.threadEmails.all(req.companyId, threadId);
    if (!emails.length) throw notFound('Mejlet finns inte.');
    if (done) {
      stmt.markDone.run({ at: new Date().toISOString(), uid: req.user.id, cid: req.companyId, tid: threadId });
    } else {
      const latest = [...emails].reverse().find((e) => e.category !== 'ovrigt');
      if (latest) stmt.reopen.run(latest.id, req.companyId);
    }
    audit({ ...officeActor(req), entity: 'inbox_thread', entityId: threadId, action: done ? 'done' : 'reopen' });
    res.json({ ok: true });
  });

  // The office corrects the sorting: "this is an order" or "this isn't an order".
  router.post('/emails/:id/category', (req, res) => {
    const email = loadEmail(req);
    const { category } = validate(z.object({ category: z.enum(CATEGORIES, { error: 'Ogiltig kategori.' }) }).strict(), req.body);
    stmt.setCategory.run(category, category === 'ovrigt' ? 'Flyttad av kontoret' : null, email.id, req.companyId);
    audit({ ...officeActor(req), entity: 'inbound_email', entityId: email.id, action: 'recategorize', before: { category: email.category }, after: { category } });
    res.json({ ok: true, thread_id: email.thread_id });
  });

  // Start an order review from an email. The AI's reading becomes a draft; nothing is a job until confirmed.
  router.post('/emails/:id/intake', (req, res) => {
    const email = loadEmail(req);
    if (email.category === 'ovrigt') throw conflict('not_order', 'Mejlet är inte sorterat som en order. Flytta det till order först.');
    if (email.order_intake_id) {
      const existing = stmt.intake.get(email.order_intake_id, req.companyId);
      if (existing?.status === 'utkast') return res.json({ intake_id: existing.id });
      if (existing?.status === 'bekraftad') throw conflict('already_confirmed', 'Det finns redan ett uppdrag från det här mejlet.', { job_id: existing.job_id });
    }
    let raw = intakeText(email, stmt.attachmentTexts.all(req.companyId, email.id));
    if (email.category === 'svar') {
      const first = stmt.threadEmails.all(req.companyId, email.thread_id)[0];
      if (first && first.id !== email.id) {
        raw += `\n\n--- Tidigare i tråden ---\n${intakeText(first, stmt.attachmentTexts.all(req.companyId, first.id))}`;
      }
    }
    const id = db.transaction(() => {
      const intakeId = Number(stmt.insertIntake.run(req.companyId, raw.slice(0, 20_000), email.ai_extraction_id, req.user.id).lastInsertRowid);
      stmt.linkIntake.run(intakeId, new Date().toISOString(), email.id, req.companyId);
      return intakeId;
    })();
    audit({ ...officeActor(req), entity: 'order_intake', entityId: id, action: 'from_email', after: { email_id: email.id, extraction_id: email.ai_extraction_id } });
    res.status(201).json({ intake_id: id });
  });

  // ── Replies ──

  function replyContext(req, email) {
    const thread = stmt.threadEmails.all(req.companyId, email.thread_id);
    const source = [...thread].reverse().find((e) => ORDER_SOURCES.includes(e.category));
    const intake = source?.order_intake_id ? stmt.intake.get(source.order_intake_id, req.companyId) : null;
    const jobId = thread.find((e) => e.job_id)?.job_id ?? intake?.job_id ?? null;
    return {
      email,
      company: stmt.company.get(req.companyId),
      userName: req.user.name,
      job: jobId ? stmt.job.get(jobId, req.companyId) : null,
      fields: extractionOf(source, req.companyId)?.fields ?? {},
      change: parse(email.change_json, []),
    };
  }

  function build(template, ctx, params) {
    if (template === 'bekrafta' && !ctx.job) throw conflict('no_job', 'Skapa uppdraget först, så blir orderbekräftelsen komplett.');
    if (template === 'bekrafta' && ctx.job.status === 'avbruten') throw conflict('cancelled', 'Uppdraget är avbrutet.');
    if (template === 'nytt_datum' && !params.datum) throw badRequest('Välj vilket datum ni kan erbjuda.', { fields: { 'params.datum': 'Välj ett datum.' } });
    return buildReply(template, ctx, params);
  }

  router.post('/emails/:id/reply/preview', (req, res) => {
    const email = loadEmail(req);
    const { template, params } = validate(previewSchema, req.body);
    const built = build(template, replyContext(req, email), params);
    res.json({ subject: built.subject, text: built.text, html: built.html ?? null, to: email.from_email });
  });

  router.post('/emails/:id/reply', limiters.mail, asyncHandler(async (req, res) => {
    const account = requireAccount(req);
    const email = loadEmail(req);
    const input = validate(sendSchema, req.body);
    const ctx = replyContext(req, email);
    const built = build(input.template, ctx, input.params);
    let text;
    let html;
    if (input.template === 'bekrafta') {
      ({ text, html } = built);
    } else {
      if (!input.text) throw badRequest('Skriv ett svar.', { fields: { text: 'Skriv ett svar.' } });
      text = `${input.text}\n\n${quoteOriginal(email)}`;
      html = replyHtml(text);
    }
    const cc = input.cc && input.cc.toLowerCase() !== input.to.toLowerCase() ? input.cc : null;
    const messageId = store.newMessageId(account.address);
    const { inReplyTo, references } = store.threadingHeaders(req.companyId, email);
    const result = await mail.send({
      fromName: ctx.company.name, to: input.to, cc, replyTo: account.address, subject: input.subject, text, html,
      messageId, inReplyTo, references,
    });
    const id = store.recordReply({
      companyId: req.companyId, email, userId: req.user.id, template: input.template, fromEmail: account.address,
      to: input.to, cc, subject: input.subject, text, html, result, messageId, jobId: ctx.job?.id ?? null,
    });
    audit({
      ...officeActor(req), entity: 'inbox_thread', entityId: email.thread_id, action: 'reply',
      after: { reply_id: id, email_id: email.id, template: input.template, to: input.to, cc, status: result.status, error: result.error ?? null },
    });
    res.status(201).json({
      id, status: result.status, to_email: input.to,
      error_message: result.error ? MAIL_ERRORS[result.error] ?? MAIL_ERRORS.other : null,
    });
  }));

  router.get('/attachments/:id', (req, res) => {
    const a = stmt.attachment.get(idParam(req.params.id), req.companyId);
    if (!a) throw notFound('Bilagan finns inte.');
    res.json({ id: a.id, filename: a.filename, content_type: a.content_type, size_bytes: a.size_bytes, text_content: a.text_content });
  });

  // ── Fetching ──

  // Fetch new mail. Only the DEMO_MODE mailbox exists today: it delivers the next held-back demo email.
  router.post('/sync', limiters.ai, asyncHandler(async (req, res) => {
    const account = requireAccount(req);
    if (account.provider !== 'demo') throw conflict('not_supported', 'Hämtning från den här e-posttjänsten är inte byggd än.');
    if (!config.demoMode) throw conflict('demo_only', 'Demoinkorgen hämtar bara nya mejl i demoläge (DEMO_MODE=1).');
    if (demoDelayMs) await new Promise((r) => setTimeout(r, demoDelayMs));
    const now = new Date();
    const today = stockholmDate(now);
    const anchor = stockholmDate(new Date(account.created_at));
    const def = nextDemoEmail(db, { companyId: req.companyId, today, anchor });
    stmt.touchSync.run(now.toISOString(), account.id);
    if (!def) return res.json({ delivered: null, last_sync_at: now.toISOString() });
    const id = store.ingest({ companyId: req.companyId, accountId: account.id, ...demoIngestArgs(def, { receivedAt: now.toISOString(), today }) });
    const email = stmt.email.get(id, req.companyId);
    audit({ ...officeActor(req), entity: 'inbound_email', entityId: id, action: 'fetch', after: { category: email.category, demo: true } });
    res.json({
      delivered: { id, thread_id: email.thread_id, category: email.category, subject: email.subject, from_name: email.from_name, summary: email.summary, filter_reason: email.filter_reason },
      last_sync_at: now.toISOString(),
    });
  }));

  // DEMO_MODE: add the demo mailbox to this company (for a database seeded before the inbox existed).
  router.post('/demo', (req, res) => {
    if (!config.demoMode) throw notFound();
    if (stmt.account.get(req.companyId)) throw conflict('has_mailbox', 'Inkorgen är redan kopplad.');
    const result = seedInbox(db, { companyId: req.companyId, userId: req.user.id });
    audit({ ...officeActor(req), entity: 'mail_account', entityId: result.accountId, action: 'connect_demo' });
    res.status(201).json(result);
  });

  return router;
}
