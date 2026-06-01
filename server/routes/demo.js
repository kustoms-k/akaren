/**
 * Demo data API — seed and reset endpoints.
 * Requires agare role (owner only).
 */

import express from 'express';
import { seedDemoData, resetDemoData, isDemoSeeded } from '../seed/demoData.js';

const router = express.Router();

// GET /api/demo/status
router.get('/status', (req, res) => {
  try {
    res.json({ seeded: isDemoSeeded() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/demo/seed
router.post('/seed', (req, res) => {
  try {
    if (isDemoSeeded()) {
      return res.status(409).json({ error: 'Demo data already seeded. Reset first.' });
    }
    const result = seedDemoData();
    res.json(result);
  } catch (err) {
    console.error('[demo/seed]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/demo/reset
router.post('/reset', (req, res) => {
  try {
    resetDemoData();
    res.json({ ok: true });
  } catch (err) {
    console.error('[demo/reset]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
