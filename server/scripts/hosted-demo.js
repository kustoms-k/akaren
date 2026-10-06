// Start the public demo on a free host (render.yaml), where the platform gives the address and secrets would
// otherwise have to be pasted in by hand. Fills in what the demo needs, then starts the normal server:
//   - APP_URL / PUBLIC_BASE_URL from the platform's external URL (RENDER_EXTERNAL_URL), unless set
//   - JWT_SECRET and ENCRYPTION_KEY generated at boot when missing: the demo holds only fake data, and a restart
//     (which a free host does when it wakes up) reseeds it anyway
//   - every real integration key removed, so the demo never spends money or sends a real SMS or email
// Refuses to run without DEMO_MODE=1, so it can never start the real app.
import { randomBytes } from 'node:crypto';

const env = process.env;
if (env.DEMO_MODE !== '1') {
  console.error('[hosted-demo] Only for the demo: set DEMO_MODE=1. The real app starts with `node index.js`.');
  process.exit(1);
}
const url = env.APP_URL || env.RENDER_EXTERNAL_URL;
if (!url) {
  console.error('[hosted-demo] Set APP_URL to the public address (or run on a host that sets RENDER_EXTERNAL_URL).');
  process.exit(1);
}
env.APP_URL = url;
env.PUBLIC_BASE_URL ||= url;
if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) env.JWT_SECRET = randomBytes(32).toString('hex');
if (!/^[0-9a-fA-F]{64}$/.test(env.ENCRYPTION_KEY ?? '')) env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
for (const key of ['ANTHROPIC_API_KEY', 'ELKS_USERNAME', 'ELKS_PASSWORD', 'SMTP_HOST', 'SMTP_PASSWORD', 'FORTNOX_CLIENT_ID', 'FORTNOX_CLIENT_SECRET']) {
  delete env[key];
}
env.DEMO_AUTO_RESET ||= '1';

await import('../index.js');
