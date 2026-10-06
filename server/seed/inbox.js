import { stockholmDate, stockholmLocalToUtc } from '../lib/dates.js';
import { DEMO_MAILBOX, demoInboxEmails, demoIngestArgs } from '../lib/inboxDemo.js';
import { buildReply, quoteOriginal, replyHtml } from '../lib/replyTemplates.js';
import { createInboxStore, intakeText } from '../services/inbox.js';

// Seeds the DEMO_MODE order mailbox for one company: the demo emails up to now, their replies and, for the
// two running seed jobs, the history from email to confirmed job. Used by seedDemo and by
// POST /api/inbox/demo (to add the mailbox to an existing demo database).

const SEED_JOBS = {
  rorstrand: ['Kv. Rörstrand – schakt', 'schakt'],
  orminge: ['Orminge centrum – grundläggning', 'grus_leverans'],
  kran: ['Arenastaden kv. Lagern', 'kran'],
};

const JOB_VIEW = `
  SELECT j.*, c.name AS customer_name, c.org_nr AS customer_org_nr,
         p.name AS project_name, p.address AS project_address, p.postnr AS project_postnr, p.ort AS project_ort, p.customer_ref
  FROM jobs j JOIN customers c ON c.id = j.customer_id JOIN projects p ON p.id = j.project_id
  WHERE j.id = ? AND j.company_id = ?`;

export function seedInbox(db, { companyId, userId, now = new Date() }) {
  if (db.prepare('SELECT 1 FROM mail_accounts WHERE company_id = ?').get(companyId)) {
    throw new Error('The company already has a mailbox');
  }
  const today = stockholmDate(now);
  const store = createInboxStore({ db });
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  const jobView = db.prepare(JOB_VIEW);
  const findJob = db.prepare(`
    SELECT j.id FROM jobs j JOIN projects p ON p.id = j.project_id
    WHERE j.company_id = ? AND p.name = ? AND j.uppdragstyp = ? ORDER BY j.id LIMIT 1`);
  const extractionFields = db.prepare('SELECT fields_json FROM ai_extractions WHERE id = ?').pluck();
  const emailRow = db.prepare('SELECT * FROM inbound_emails WHERE id = ?');
  const insertIntake = db.prepare(`
    INSERT INTO order_intakes (company_id, raw_text, ai_extraction_id, status, job_id, created_by_user_id,
      confirmed_by_user_id, created_at, confirmed_at)
    VALUES (?, ?, ?, 'bekraftad', ?, ?, ?, ?, ?)`);
  const linkIntake = db.prepare('UPDATE inbound_emails SET order_intake_id = ?, job_id = ? WHERE id = ?');
  const linkJob = db.prepare('UPDATE jobs SET order_intake_id = ? WHERE id = ? AND order_intake_id IS NULL');

  const jobIds = {};
  for (const [key, [project, typ]] of Object.entries(SEED_JOBS)) {
    const id = findJob.pluck().get(companyId, project, typ);
    if (id) jobIds[key] = id;
  }

  return db.transaction(() => {
    const accountId = Number(db.prepare(`
      INSERT INTO mail_accounts (company_id, provider, address, folder, status, last_sync_at, created_at)
      VALUES (?, 'demo', ?, 'Inkorgen', 'connected', ?, ?)`)
      .run(companyId, DEMO_MAILBOX, new Date(now.getTime() - 2 * 60_000).toISOString(), now.toISOString()).lastInsertRowid);

    const at = ([date, time]) => stockholmLocalToUtc(date, time);
    const defs = demoInboxEmails(today).filter((d) => !d.pool);
    // A job ordered by email that the seed didn't create (e.g. a trimmed database): leave its history out.
    const usable = defs.filter((d) => !d.history || jobIds[d.job]);

    // Today's emails dated later than `now` arrive "just now" instead, a few minutes apart.
    const future = usable.filter((d) => at(d.at) > now.toISOString()).sort((a, b) => at(a.at).localeCompare(at(b.at)));
    const receivedAt = (d) => {
      const i = future.indexOf(d);
      return i < 0 ? at(d.at) : new Date(now.getTime() - (future.length - i) * 4 * 60_000).toISOString();
    };

    // Emails and replies in time order, so threads connect.
    const events = [];
    for (const d of usable) {
      events.push({ kind: 'email', at: receivedAt(d), d });
      for (const r of d.replies) events.push({ kind: 'reply', at: at(r.at), d, r });
    }
    events.sort((a, b) => a.at.localeCompare(b.at));

    const ids = {};
    const replies = {};
    const counts = { emails: 0, replies: 0 };
    for (const ev of events) {
      const { d } = ev;
      if (ev.kind === 'email') {
        let body = d.body;
        if (d.quote && replies[d.quote]) body = `${body}\n\n${quoteOriginal(replies[d.quote])}`;
        const args = demoIngestArgs(d, { receivedAt: ev.at, today: stockholmDate(new Date(ev.at)), jobIds, body });
        const handled = d.state === 'handled' && !d.replies.length && !d.history ? ev.at : null;
        ids[d.key] = store.ingest({
          companyId, accountId, ...args,
          state: { read_at: d.state === 'unread' ? null : ev.at, handled_at: handled, handled_by_user_id: handled ? userId : null },
        });
        counts.emails++;

        if (d.history) {
          const email = emailRow.get(ids[d.key]);
          const intakeId = Number(insertIntake.run(companyId, intakeText({ ...email, attachments: [] }), email.ai_extraction_id, jobIds[d.job], userId, userId,
            at(d.history.intake), at(d.history.confirmed)).lastInsertRowid);
          linkIntake.run(intakeId, jobIds[d.job], email.id);
          linkJob.run(intakeId, jobIds[d.job]);
        }
        continue;
      }

      // A reply from the office, built from the same templates the inbox uses.
      const email = emailRow.get(ids[d.key]);
      const job = email.job_id ? jobView.get(email.job_id, companyId) : null;
      const { fields = {} } = JSON.parse(extractionFields.get(email.ai_extraction_id) ?? '{}');
      const built = buildReply(ev.r.template, {
        email, company, userName: user.name, job, fields, change: JSON.parse(email.change_json),
      }, ev.r.params);
      const text = built.html ? built.text : `${built.text}\n\n${quoteOriginal(email)}`;
      store.recordReply({
        companyId, email, userId, template: ev.r.template, fromEmail: DEMO_MAILBOX, to: email.from_email, subject: built.subject,
        text, html: built.html ?? replyHtml(text), result: { status: 'simulerat' }, messageId: ev.r.message_id,
        jobId: job?.id ?? null, at: ev.at,
      });
      replies[ev.r.key] = { from_name: company.name, from_email: DEMO_MAILBOX, received_at: ev.at, body_text: text };
      counts.replies++;
    }
    return { accountId, ...counts, pool: demoInboxEmails(today).filter((d) => d.pool).length };
  })();
}

/** The next held-back demo email not yet in the mailbox, or null when all have arrived. */
export function nextDemoEmail(db, { companyId, today, anchor }) {
  const exists = db.prepare('SELECT 1 FROM inbound_emails WHERE company_id = ? AND message_id = ?');
  return demoInboxEmails(today, anchor)
    .filter((d) => d.pool)
    .sort((a, b) => a.pool - b.pool)
    .find((d) => !exists.get(companyId, d.message_id)) ?? null;
}

