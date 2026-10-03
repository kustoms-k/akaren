/**
 * 46elks SMS client. Without credentials it runs in simulation mode and logs the message.
 * send() never throws; callers inspect { status: 'skickat' | 'simulerat' | 'misslyckat', error? }.
 */
export function createSmsService({ config, fetch = globalThis.fetch, logger = console }) {
  const { username, password, sender, apiBase, enabled } = config.elks;

  async function send(to, message) {
    if (!enabled) {
      logger.log(`\n[SMS SIMULERAT → ${to}]\n${message}\n`);
      return { status: 'simulerat' };
    }
    try {
      const res = await fetch(`${apiBase}/sms`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ from: sender, to, message }).toString(),
      });
      if (!res.ok) {
        const text = await res.text();
        logger.error(`[sms] 46elks ${res.status}: ${text}`);
        return { status: 'misslyckat', error: `46elks ${res.status}` };
      }
      return { status: 'skickat' };
    } catch (err) {
      logger.error('[sms] send failed:', err.message);
      return { status: 'misslyckat', error: 'network' };
    }
  }

  return { enabled, send };
}
