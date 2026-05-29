import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM      = process.env.SMTP_FROM ?? 'Åkaren TMS <noreply@akaren.se>';

function createTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendMail({ to, cc, subject, html, text, attachments }) {
  const transport = createTransport();
  if (!transport) {
    console.log(`[mailer] Would send to ${to}: ${subject}`);
    return { simulated: true };
  }
  try {
    await transport.sendMail({ from: FROM, to, cc, subject, html, text, attachments });
    console.log(`[mailer] Sent "${subject}" to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`[mailer] Failed to send "${subject}" to ${to}:`, err.message);
    throw err;
  }
}

export async function sendSubscriptionActivated({ email, companyName, renewsAt }) {
  const renews = renewsAt
    ? new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' }).format(new Date(renewsAt * 1000))
    : null;

  return sendMail({
    to: email,
    subject: 'Prenumeration aktiverad – Åkaren TMS',
    text: `Hej ${companyName},\n\nDin prenumeration på Åkaren TMS är nu aktiv.${renews ? `\nFörnyelsedatum: ${renews}` : ''}\n\nTack för att du väljer Åkaren TMS!\n`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#151210">
        <div style="background:#0d0d0f;padding:24px 28px;border-radius:10px 10px 0 0">
          <span style="font-size:18px;font-weight:700;color:#c9921e;letter-spacing:-0.01em">Åkaren TMS</span>
        </div>
        <div style="border:1px solid #e6e2da;border-top:none;border-radius:0 0 10px 10px;padding:28px">
          <h2 style="margin:0 0 12px;font-size:17px;font-weight:700">Prenumeration aktiverad ✓</h2>
          <p style="margin:0 0 16px;color:#6a6050;line-height:1.6">Hej <strong>${companyName}</strong>,<br>Din prenumeration på Åkaren TMS är nu aktiv. Du har full tillgång till samtliga funktioner för offerthantering och transportstyrning.</p>
          ${renews ? `<div style="background:#f4f0e7;border-radius:8px;padding:12px 16px;font-size:13px;color:#6a6050">Förnyas: <strong style="color:#151210">${renews}</strong></div>` : ''}
          <p style="margin:20px 0 0;font-size:12px;color:#9a9082">Du hanterar din prenumeration via Inställningar → Fakturering.</p>
        </div>
      </div>`,
  });
}

export async function sendPaymentFailed({ email, companyName }) {
  return sendMail({
    to: email,
    subject: 'Betalning misslyckades – Åkaren TMS',
    text: `Hej ${companyName},\n\nVi kunde inte ta betalt för din Åkaren TMS-prenumeration. Vänligen uppdatera dina betalningsuppgifter via Inställningar → Fakturering.\n`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#151210">
        <div style="background:#0d0d0f;padding:24px 28px;border-radius:10px 10px 0 0">
          <span style="font-size:18px;font-weight:700;color:#c9921e;letter-spacing:-0.01em">Åkaren TMS</span>
        </div>
        <div style="border:1px solid #fca5a5;border-top:none;border-radius:0 0 10px 10px;padding:28px">
          <h2 style="margin:0 0 12px;font-size:17px;font-weight:700;color:#dc2626">Betalning misslyckades</h2>
          <p style="margin:0 0 16px;color:#6a6050;line-height:1.6">Hej <strong>${companyName}</strong>,<br>Vi kunde inte ta betalt för din prenumeration. Din tillgång kan komma att begränsas om betalningen inte genomförs.</p>
          <p style="margin:0 0 16px;color:#6a6050">Uppdatera dina betalningsuppgifter via <strong>Inställningar → Fakturering</strong> för att undvika avbrott.</p>
          <p style="margin:20px 0 0;font-size:12px;color:#9a9082">Om du behöver hjälp, kontakta oss på support@akaren.se.</p>
        </div>
      </div>`,
  });
}

export async function sendSubscriptionCanceled({ email, companyName }) {
  return sendMail({
    to: email,
    subject: 'Prenumeration avslutad – Åkaren TMS',
    text: `Hej ${companyName},\n\nDin Åkaren TMS-prenumeration har avslutats. Du kan återaktivera när som helst via Inställningar → Fakturering.\n`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#151210">
        <div style="background:#0d0d0f;padding:24px 28px;border-radius:10px 10px 0 0">
          <span style="font-size:18px;font-weight:700;color:#c9921e;letter-spacing:-0.01em">Åkaren TMS</span>
        </div>
        <div style="border:1px solid #e6e2da;border-top:none;border-radius:0 0 10px 10px;padding:28px">
          <h2 style="margin:0 0 12px;font-size:17px;font-weight:700">Prenumeration avslutad</h2>
          <p style="margin:0 0 16px;color:#6a6050;line-height:1.6">Hej <strong>${companyName}</strong>,<br>Din prenumeration på Åkaren TMS har avslutats. Tack för att du har använt vår tjänst.</p>
          <p style="margin:0 0 16px;color:#6a6050">Du kan återaktivera din prenumeration när som helst via <strong>Inställningar → Fakturering</strong>.</p>
        </div>
      </div>`,
  });
}
