/**
 * 46elks SMS helper.
 *
 * smsEnabled is derived from env at startup — no manual flag needed.
 * sendSms always resolves; callers inspect { status, error } instead of catching.
 */

const USERNAME = process.env.ELKS_USERNAME;
const PASSWORD = process.env.ELKS_PASSWORD;

export const smsEnabled = Boolean(USERNAME && PASSWORD);

/** Build the standard driver notification message from a quote row. */
export function buildSmsMessage(quote) {
  const lasttyp  = quote.lasttyp     ?? 'Okänd last';
  const upphämt  = quote.upphämtning ?? '—';
  const leverans = quote.leverans    ?? '—';
  const datum    = quote.datum       ?? '—';
  const fordon   = quote.fordon_id   ?? '—';
  return (
    `Nytt uppdrag: ${lasttyp} från ${upphämt} till ${leverans} ${datum}.` +
    ` Fordon: ${fordon}. Frågor: ring kontoret.`
  );
}

/**
 * Send an SMS via 46elks, or simulate if credentials are absent.
 * Never throws — always returns { status: 'sent'|'simulated'|'failed', error? }.
 */
export async function sendSms(to, message) {
  if (!smsEnabled) {
    console.log(`\n[SMS SIMULERAD → ${to}]\n${message}\n`);
    return { status: 'simulated' };
  }

  try {
    const body = new URLSearchParams({ from: 'Åkaren', to, message });
    const resp = await fetch('https://api.46elks.com/a1/sms', {
      method:  'POST',
      headers: {
        Authorization:  'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { status: 'failed', error: `46elks ${resp.status}: ${txt}` };
    }
    return { status: 'sent' };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}
