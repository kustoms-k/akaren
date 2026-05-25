import db from '../db.js';

const stmtStatus = db.prepare('SELECT stripe_subscription_status FROM companies WHERE id = ?');

export function requireSubscription(req, res, next) {
  // Stripe not configured — dev/demo mode, allow through
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) return next();

  const company = stmtStatus.get(req.companyId);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const { stripe_subscription_status: s } = company;
  if (s === 'active' || s === 'trialing') return next();

  return res.status(402).json({
    error: 'subscription_required',
    status: s ?? 'none',
    message: 'An active subscription is required to use this feature.',
  });
}
