import { Router } from 'express';
import db          from '../db.js';
import {
  buildAuthUrl, consumeOAuthState, connectFortnox,
  clearTokens, getConnectionStatus, syncCustomers,
} from '../services/fortnox.js';

const router = Router();

// GET /api/fortnox/connect-url — owner generates OAuth URL (returns JSON, no redirect)
router.get('/connect-url', (req, res) => {
  try {
    const url = buildAuthUrl(req.companyId);
    res.json({ url });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// GET /api/fortnox/callback — public; Fortnox redirects here after user approval
router.get('/callback', async (req, res) => {
  const appUrl  = process.env.APP_URL ?? 'http://localhost:5173';
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${appUrl}/?fortnox=error&msg=${encodeURIComponent(error)}#settings`);
  }

  if (!code || !state) {
    return res.redirect(`${appUrl}/?fortnox=error&msg=missing_params#settings`);
  }

  const companyId = consumeOAuthState(state);
  if (!companyId) {
    return res.redirect(`${appUrl}/?fortnox=error&msg=invalid_state#settings`);
  }

  try {
    await connectFortnox(companyId, code);
    res.redirect(`${appUrl}/?fortnox=connected#settings`);
  } catch (err) {
    console.error('[fortnox] connect failed:', err.message);
    res.redirect(`${appUrl}/?fortnox=error&msg=${encodeURIComponent(err.message)}#settings`);
  }
});

// All routes below require auth (applied in index.js) + owner role
// GET /api/fortnox/status
router.get('/status', (req, res) => {
  const status = getConnectionStatus(req.companyId);
  const customers = status.connected
    ? db.prepare('SELECT COUNT(*) AS n FROM customers WHERE company_id = ?').get(req.companyId)?.n ?? 0
    : 0;
  res.json({ ...status, customer_count: customers });
});

// DELETE /api/fortnox/disconnect
router.delete('/disconnect', (req, res) => {
  clearTokens(req.companyId);
  // Also remove synced customers for this company
  db.prepare('DELETE FROM customers WHERE company_id = ?').run(req.companyId);
  res.json({ ok: true });
});

// POST /api/fortnox/sync-customers
router.post('/sync-customers', async (req, res) => {
  try {
    const result = await syncCustomers(req.companyId);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/fortnox/customers — list local customers for UI dropdowns
router.get('/customers', (req, res) => {
  const rows = db.prepare(
    `SELECT id, fortnox_customer_nr, name, city, email, org_nr
     FROM customers WHERE company_id = ? ORDER BY name ASC`
  ).all(req.companyId);
  res.json(rows);
});

export default router;
