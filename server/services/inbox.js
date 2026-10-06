import { randomUUID } from 'node:crypto';
import { postProcessOrder } from '../lib/orderExtraction.js';

/**
 * The order inbox store. `ingest` saves one fetched email with its triage (category, summary and, for
 * orders, the AI extraction) and threads it; `recordReply` saves a reply sent from the inbox.
 * Where the triage comes from is the caller's business: today the DEMO_MODE mailbox (lib/inboxDemo.js);
 * a real mailbox will fetch over IMAP/Graph and triage through services/ai.js.
 */
export function createInboxStore({ db }) {
  const stmt = {
    byMessage: db.prepare('SELECT id, thread_id FROM inbound_emails WHERE company_id = ? AND message_id = ?'),
    replyByMessage: db.prepare('SELECT thread_id FROM email_replies WHERE company_id = ? AND message_id = ?'),
    insert: db.prepare(`
      INSERT INTO inbound_emails (company_id, mail_account_id, message_id, in_reply_to, thread_id, from_name, from_email,
        to_email, cc, subject, body_text, received_at, category, category_source, summary, filter_reason, flags_json,
        change_json, ai_extraction_id, job_id, read_at, handled_at, handled_by_user_id, created_at)
      VALUES (@company_id, @mail_account_id, @message_id, @in_reply_to, @thread_id, @from_name, @from_email,
        @to_email, @cc, @subject, @body_text, @received_at, @category, @category_source, @summary, @filter_reason, @flags_json,
        @change_json, @ai_extraction_id, @job_id, @read_at, @handled_at, @handled_by_user_id, @created_at)
    `),
    setThread: db.prepare('UPDATE inbound_emails SET thread_id = id WHERE id = ?'),
    attachment: db.prepare(`
      INSERT INTO inbound_attachments (company_id, email_id, filename, content_type, size_bytes, text_content)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    extraction: db.prepare(`
      INSERT INTO ai_extractions (company_id, kind, model, prompt_version, input_text, fields_json, confidence_json,
        raw_response, latency_ms, cost_micro_usd, created_at)
      VALUES (@company_id, 'order', @model, @prompt_version, @input_text, @fields_json, @confidence_json,
        @raw_response, @latency_ms, @cost_micro_usd, @created_at)
    `),
    insertReply: db.prepare(`
      INSERT INTO email_replies (company_id, thread_id, inbound_email_id, template, from_email, to_email, cc_email, subject,
        body_text, body_html, status, error, message_id, order_confirmation_id, sent_by_user_id, created_at)
      VALUES (@company_id, @thread_id, @inbound_email_id, @template, @from_email, @to_email, @cc_email, @subject,
        @body_text, @body_html, @status, @error, @message_id, @order_confirmation_id, @sent_by_user_id, @created_at)
    `),
    insertConfirmation: db.prepare(`
      INSERT INTO order_confirmations (company_id, job_id, to_email, cc_email, subject, body_text, body_html, status, error,
        message_id, sent_by_user_id, created_at)
      VALUES (@company_id, @job_id, @to_email, @cc_email, @subject, @body_text, @body_html, @status, @error,
        @message_id, @sent_by_user_id, @created_at)
    `),
    handleEmail: db.prepare(`
      UPDATE inbound_emails SET handled_at = COALESCE(handled_at, @at), handled_by_user_id = COALESCE(handled_by_user_id, @user_id),
        read_at = COALESCE(read_at, @at)
      WHERE id = @id AND company_id = @company_id
    `),
    messageIds: db.prepare(`
      SELECT message_id, received_at AS at FROM inbound_emails WHERE company_id = @cid AND thread_id = @tid
      UNION ALL
      SELECT message_id, created_at AS at FROM email_replies WHERE company_id = @cid AND thread_id = @tid
      ORDER BY at
    `),
  };

  /** The thread an email belongs to: the one holding the message it replies to, if we know it. */
  function threadFor(companyId, inReplyTo) {
    if (!inReplyTo) return null;
    return stmt.byMessage.get(companyId, inReplyTo)?.thread_id
      ?? stmt.replyByMessage.get(companyId, inReplyTo)?.thread_id
      ?? null;
  }

  /**
   * Save one email. Returns its id, or null if it was already stored (same Message-ID): fetching is idempotent.
   * message: { message_id, in_reply_to, from_name, from_email, to_email, cc, subject, body_text, received_at, attachments[] }
   * triage: { category, source, summary, filter_reason, flags[], change[], job_id,
   *           extraction: { raw, model, prompt_version, today } | null }
   * state: { read_at, handled_at, handled_by_user_id } for seeded history.
   */
  function ingest({ companyId, accountId, message, triage, state = {} }) {
    return db.transaction(() => {
      if (stmt.byMessage.get(companyId, message.message_id)) return null;
      let extractionId = null;
      if (triage.extraction) {
        const { raw, model, prompt_version: promptVersion, today } = triage.extraction;
        const { fields, warnings } = postProcessOrder(raw, { today });
        extractionId = Number(stmt.extraction.run({
          company_id: companyId, model, prompt_version: promptVersion, input_text: intakeText(message),
          fields_json: JSON.stringify({ fields, warnings }),
          confidence_json: JSON.stringify(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.confidence]))),
          raw_response: JSON.stringify(raw), latency_ms: triage.extraction.latency_ms ?? null,
          cost_micro_usd: triage.extraction.cost_micro_usd ?? 0, created_at: message.received_at,
        }).lastInsertRowid);
      }
      const threadId = threadFor(companyId, message.in_reply_to);
      const id = Number(stmt.insert.run({
        company_id: companyId, mail_account_id: accountId, message_id: message.message_id,
        in_reply_to: message.in_reply_to ?? null, thread_id: threadId, from_name: message.from_name ?? null,
        from_email: message.from_email.toLowerCase(), to_email: message.to_email ?? null, cc: message.cc ?? null,
        subject: message.subject ?? '', body_text: message.body_text ?? '', received_at: message.received_at,
        category: triage.category, category_source: triage.source, summary: triage.summary ?? null,
        filter_reason: triage.filter_reason ?? null, flags_json: JSON.stringify(triage.flags ?? []),
        change_json: JSON.stringify(triage.change ?? []), ai_extraction_id: extractionId, job_id: triage.job_id ?? null,
        read_at: state.read_at ?? null, handled_at: state.handled_at ?? null,
        handled_by_user_id: state.handled_by_user_id ?? null, created_at: message.received_at,
      }).lastInsertRowid);
      if (threadId == null) stmt.setThread.run(id);
      for (const a of message.attachments ?? []) {
        stmt.attachment.run(companyId, id, a.filename, a.content_type, a.size_bytes ?? 0, a.text_content ?? null);
      }
      return id;
    })();
  }

  /** Message-ID for a reply from `address`, e.g. <uuid@testakeriet.se>. */
  function newMessageId(address) {
    return `<${randomUUID()}@${String(address).split('@')[1] ?? 'akaren.local'}>`;
  }

  /** In-Reply-To and References for a reply to `email` (the whole thread, oldest first, at most 20). */
  function threadingHeaders(companyId, email) {
    const ids = stmt.messageIds.all({ cid: companyId, tid: email.thread_id }).map((r) => r.message_id);
    return { inReplyTo: email.message_id, references: ids.slice(-20) };
  }

  /**
   * Save a sent reply; marks the email it answers as handled. A 'bekrafta' reply on a job is also stored as
   * that job's order confirmation, so the job page shows it was confirmed.
   */
  function recordReply({ companyId, email, userId, template, fromEmail, to, cc = null, subject, text, html, result, messageId, jobId = null, at = new Date().toISOString() }) {
    return db.transaction(() => {
      let confirmationId = null;
      if (template === 'bekrafta' && jobId) {
        confirmationId = Number(stmt.insertConfirmation.run({
          company_id: companyId, job_id: jobId, to_email: to, cc_email: cc, subject, body_text: text, body_html: html,
          status: result.status, error: result.error ?? null, message_id: messageId, sent_by_user_id: userId, created_at: at,
        }).lastInsertRowid);
      }
      const id = Number(stmt.insertReply.run({
        company_id: companyId, thread_id: email.thread_id, inbound_email_id: email.id, template, from_email: fromEmail,
        to_email: to, cc_email: cc, subject, body_text: text, body_html: html, status: result.status,
        error: result.error ?? null, message_id: messageId, order_confirmation_id: confirmationId, sent_by_user_id: userId,
        created_at: at,
      }).lastInsertRowid);
      if (result.status !== 'misslyckat') stmt.handleEmail.run({ id: email.id, company_id: companyId, at, user_id: userId });
      return id;
    })();
  }

  return { ingest, recordReply, newMessageId, threadingHeaders };
}

/** The text an order intake (and the AI) reads for an email: the body plus any attachment text. */
export function intakeText(message, attachments = message.attachments ?? []) {
  const parts = [`Från: ${message.from_name ? `${message.from_name} <${message.from_email}>` : message.from_email}`,
    `Ämne: ${message.subject ?? ''}`, '', String(message.body_text ?? '').trim()];
  for (const a of attachments) {
    if (a.text_content) parts.push('', `--- Bilaga: ${a.filename} ---`, a.text_content.trim());
  }
  return parts.join('\n');
}
