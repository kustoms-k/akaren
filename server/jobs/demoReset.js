import cron from 'node-cron';
import { resetDemo } from '../seed/resetDemo.js';

/** Hosted demo instance (DEMO_AUTO_RESET=1): fresh demo data every night at 03:30 Stockholm time. */
export function scheduleDemoReset({ db, config, audit, logger = console }) {
  if (!config.demoAutoReset) return null;
  return cron.schedule('30 3 * * *', () => {
    resetDemo({ db, config, audit, logger }).catch((err) => logger.error('[demo] nightly reset failed:', err));
  }, { timezone: 'Europe/Stockholm' });
}
