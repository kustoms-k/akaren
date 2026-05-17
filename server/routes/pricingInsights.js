import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/pricing-insights — all precomputed insights for the authenticated company.
// Data is company-scoped and never shared across tenants.
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT insight_type, insight_data, confidence, created_at
     FROM pricing_insights WHERE company_id = ?`
  ).all(req.companyId);

  if (rows.length === 0) {
    // Job hasn't run yet — return baseline unlock status from live quote count
    const { n } = db.prepare(
      `SELECT COUNT(*) AS n FROM quotes WHERE company_id = ? AND status = 'godkänd'`
    ).get(req.companyId);
    return res.json({ unlocked: false, accepted_count: n, threshold: 30, insights: [] });
  }

  const insights = rows.map((r) => ({
    insight_type: r.insight_type,
    insight_data: JSON.parse(r.insight_data),
    confidence:   r.confidence,
    created_at:   r.created_at,
  }));

  const statusItem = insights.find((i) => i.insight_type === 'status');
  res.json({
    unlocked:      statusItem?.insight_data?.unlocked      ?? false,
    accepted_count: statusItem?.insight_data?.accepted_count ?? 0,
    threshold:     30,
    insights,
    computed_at:   statusItem?.created_at ?? null,
  });
});

export default router;
