import { Router } from 'express';
import Stripe from 'stripe';
import db from '../db.js';
import {
  sendSubscriptionActivated,
  sendPaymentFailed,
  sendSubscriptionCanceled,
} from '../utils/mailer.js';

const router = Router();

const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const PRICE_ID    = process.env.STRIPE_PRICE_ID;
const APP_URL     = process.env.APP_URL ?? 'http://localhost:5173';
const SUCCESS_URL = `${APP_URL}/settings?stripe=success`;
const CANCEL_URL  = `${APP_URL}/settings?stripe=cancel`;

const stmtGetCompany = db.prepare('SELECT * FROM companies WHERE id = ?');
const stmtSetStripe  = db.prepare(`
  UPDATE companies
  SET stripe_customer_id         = ?,
      stripe_subscription_id     = ?,
      stripe_subscription_status = ?,
      subscription_renews_at     = ?
  WHERE id = ?
`);

// ── GET /api/stripe/status ─────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  const company = stmtGetCompany.get(req.companyId);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  res.json({
    status:         company.stripe_subscription_status ?? 'none',
    renews_at:      company.subscription_renews_at ?? null,
    stripe_enabled: Boolean(stripeClient && PRICE_ID),
    has_customer:   Boolean(company.stripe_customer_id),
  });
});

// ── POST /api/stripe/checkout ──────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  if (!stripeClient) return res.status(503).json({ error: 'Stripe is not configured on this server' });
  if (!PRICE_ID)     return res.status(503).json({ error: 'STRIPE_PRICE_ID is not configured' });

  const company = stmtGetCompany.get(req.companyId);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  try {
    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeClient.customers.create({
        name:     company.name,
        email:    company.email ?? undefined,
        metadata: { company_id: String(req.companyId) },
      });
      customerId = customer.id;
      db.prepare('UPDATE companies SET stripe_customer_id = ? WHERE id = ?')
        .run(customerId, req.companyId);
    }

    const session = await stripeClient.checkout.sessions.create({
      mode:        'subscription',
      customer:    customerId,
      line_items:  [{ price: PRICE_ID, quantity: 1 }],
      success_url: SUCCESS_URL,
      cancel_url:  CANCEL_URL,
      metadata:    { company_id: String(req.companyId) },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stripe/portal ────────────────────────────────────────────────────
router.post('/portal', async (req, res) => {
  if (!stripeClient) return res.status(503).json({ error: 'Stripe is not configured on this server' });

  const company = stmtGetCompany.get(req.companyId);
  if (!company?.stripe_customer_id) {
    return res.status(400).json({ error: 'No Stripe customer found — subscribe first' });
  }

  try {
    const session = await stripeClient.billingPortal.sessions.create({
      customer:   company.stripe_customer_id,
      return_url: SUCCESS_URL,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] portal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

// ── Webhook handler (exported for raw-body registration in index.js) ───────────
export async function handleStripeWebhook(req, res) {
  if (!stripeClient) return res.json({ received: true });

  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = secret
      ? stripeClient.webhooks.constructEvent(req.body, sig, secret)
      : JSON.parse(req.body.toString());
  } catch (err) {
    console.error('[stripe] webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    await processWebhookEvent(event);
  } catch (err) {
    console.error('[stripe] webhook handler error:', err.message);
  }

  res.json({ received: true });
}

async function processWebhookEvent(event) {
  const obj = event.data.object;

  if (event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated') {
    const companyId = await resolveCompanyId(obj.customer);
    if (!companyId) return;
    const renewsAt = obj.current_period_end
      ? new Date(obj.current_period_end * 1000).toISOString()
      : null;
    stmtSetStripe.run(obj.customer, obj.id, obj.status, renewsAt, companyId);
    console.log(`[stripe] subscription ${obj.status} for company ${companyId}`);

    if (obj.status === 'active' || obj.status === 'trialing') {
      const company = db.prepare('SELECT name, email FROM companies WHERE id = ?').get(companyId);
      if (company?.email) {
        sendSubscriptionActivated({
          email:       company.email,
          companyName: company.name,
          renewsAt:    obj.current_period_end ?? null,
        }).catch(console.error);
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const companyId = await resolveCompanyId(obj.customer);
    if (!companyId) return;
    stmtSetStripe.run(obj.customer, obj.id, 'canceled', null, companyId);
    console.log(`[stripe] subscription canceled for company ${companyId}`);

    const company = db.prepare('SELECT name, email FROM companies WHERE id = ?').get(companyId);
    if (company?.email) {
      sendSubscriptionCanceled({ email: company.email, companyName: company.name }).catch(console.error);
    }
  }

  if (event.type === 'checkout.session.completed' && obj.subscription) {
    const companyId = obj.metadata?.company_id
      ? Number(obj.metadata.company_id)
      : await resolveCompanyId(obj.customer);
    if (!companyId) return;

    const sub = await stripeClient.subscriptions.retrieve(obj.subscription);
    const renewsAt = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;
    stmtSetStripe.run(obj.customer, obj.subscription, sub.status, renewsAt, companyId);
    console.log(`[stripe] checkout complete for company ${companyId}`);
  }

  if (event.type === 'invoice.payment_failed') {
    const companyId = await resolveCompanyId(obj.customer);
    if (!companyId) return;
    db.prepare(`UPDATE companies SET stripe_subscription_status = 'past_due' WHERE id = ?`)
      .run(companyId);
    console.warn(`[stripe] payment failed for company ${companyId}`);

    const company = db.prepare('SELECT name, email FROM companies WHERE id = ?').get(companyId);
    if (company?.email) {
      sendPaymentFailed({ email: company.email, companyName: company.name }).catch(console.error);
    }
  }
}

async function resolveCompanyId(stripeCustomerId) {
  const row = db.prepare('SELECT id FROM companies WHERE stripe_customer_id = ?')
    .get(stripeCustomerId);
  if (row) return row.id;

  try {
    const customer = await stripeClient.customers.retrieve(stripeCustomerId);
    const id = customer.metadata?.company_id;
    return id ? Number(id) : null;
  } catch {
    return null;
  }
}
