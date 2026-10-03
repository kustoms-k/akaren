import { Router } from 'express';
import { asyncHandler, HttpError } from '../lib/http.js';
import { officeActor } from '../lib/audit.js';
import { FortnoxNotConfiguredError, FortnoxReconnectError } from '../services/fortnox.js';

/** Map Fortnox service errors to user-facing HTTP errors. */
export function fortnoxHttpError(err) {
  if (err instanceof FortnoxNotConfiguredError) {
    return new HttpError(503, 'fortnox_not_configured', 'Fortnox är inte konfigurerat på servern (FORTNOX_* saknas).');
  }
  if (err instanceof FortnoxReconnectError) {
    return new HttpError(409, 'fortnox_reconnect_required', 'Fortnox-kopplingen har gått ut. Anslut Fortnox igen under Inställningar.');
  }
  return new HttpError(502, 'fortnox_error', 'Fortnox svarade med ett fel. Försök igen om en stund.');
}

/** Public OAuth callback: Fortnox redirects the browser here after approval. */
export function fortnoxCallbackRouter({ fortnox, config, logger = console }) {
  const router = Router();
  router.get('/', asyncHandler(async (req, res) => {
    const back = (params) => res.redirect(`${config.appUrl}/installningar?${new URLSearchParams(params)}`);
    const { code, state, error } = req.query;
    if (error) return back({ fortnox: 'error', reason: String(error).slice(0, 60) });
    const companyId = typeof state === 'string' ? fortnox.consumeState(state) : null;
    if (!code || !companyId) return back({ fortnox: 'error', reason: 'invalid_state' });
    try {
      await fortnox.connect(companyId, String(code));
      back({ fortnox: 'connected' });
    } catch (err) {
      logger.error('[fortnox] connect failed:', err.message);
      back({ fortnox: 'error', reason: 'token_exchange' });
    }
  }));
  return router;
}

export function fortnoxRouter({ fortnox, audit }) {
  const router = Router();

  router.get('/status', (req, res) => {
    res.json(fortnox.getStatus(req.companyId));
  });

  router.get('/connect-url', (req, res) => {
    try {
      res.json({ url: fortnox.buildAuthUrl(req.companyId) });
    } catch (err) {
      throw fortnoxHttpError(err);
    }
  });

  router.post('/disconnect', (req, res) => {
    fortnox.disconnect(req.companyId);
    audit({ ...officeActor(req), entity: 'fortnox', action: 'disconnect' });
    res.json(fortnox.getStatus(req.companyId));
  });

  router.post('/sync-customers', asyncHandler(async (req, res) => {
    try {
      const counts = await fortnox.syncCustomers(req.companyId);
      audit({ ...officeActor(req), entity: 'fortnox', action: 'sync_customers', after: counts });
      res.json(counts);
    } catch (err) {
      throw fortnoxHttpError(err);
    }
  }));

  return router;
}
