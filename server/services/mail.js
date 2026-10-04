import nodemailer from 'nodemailer';

/** Map a nodemailer error to a short code; the Swedish text lives in lib/orderConfirmation.js (MAIL_ERRORS). */
function errorCode(err) {
  if (err?.code === 'EAUTH' || err?.responseCode === 535) return 'auth';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ETLS', 'ECONNREFUSED'].includes(err?.code)) return 'connection';
  if (err?.code === 'EENVELOPE' || (err?.responseCode >= 500 && err?.responseCode < 600)) return 'rejected';
  return 'other';
}

/**
 * SMTP email. Without SMTP_HOST/MAIL_FROM it runs in simulation mode and logs the message.
 * send() never throws; callers inspect { status: 'skickat' | 'simulerat' | 'misslyckat', messageId?, error? }.
 * `transport` (anything with sendMail) is injectable for tests.
 */
export function createMailService({ config, transport, logger = console }) {
  const m = config.mail;
  const tx = transport ?? (m.enabled
    ? nodemailer.createTransport({
      host: m.host,
      port: m.port,
      secure: m.secure,
      requireTLS: !m.secure, // never send credentials or customer data in clear text
      ...(m.user ? { auth: { user: m.user, pass: m.password ?? '' } } : {}),
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    })
    : null);

  async function send({ fromName, to, cc, bcc, replyTo, subject, text, html }) {
    if (!tx) {
      logger.log(`\n[E-POST SIMULERAT → ${to}${cc ? `, kopia ${cc}` : ''}${bcc ? `, dold kopia ${bcc}` : ''}]\nÄmne: ${subject}\n\n${text}\n`);
      return { status: 'simulerat' };
    }
    try {
      const info = await tx.sendMail({
        from: { name: fromName, address: m.from },
        to,
        ...(cc ? { cc } : {}),
        ...(bcc ? { bcc } : {}),
        ...(replyTo ? { replyTo } : {}),
        subject,
        text,
        html,
      });
      return { status: 'skickat', messageId: info?.messageId ?? null };
    } catch (err) {
      logger.error('[mail] send failed:', err?.code ?? '', err?.responseCode ?? '', err?.message);
      return { status: 'misslyckat', error: errorCode(err) };
    }
  }

  return { enabled: Boolean(tx), from: m.from, send };
}
