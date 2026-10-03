import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const tooMany = (req, res) =>
  res.status(429).json({ error: { code: 'rate_limited', message: 'För många förfrågningar. Vänta en stund och försök igen.' } });

const make = (windowMinutes, max, keyGenerator) => rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  limit: max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany,
  ...(keyGenerator ? { keyGenerator } : {}),
});

// Key per office user or driver link when authenticated, otherwise per IP.
const actorKey = (req) =>
  req.user ? `office:${req.user.id}` : req.driver ? `driver:${req.driver.linkId}` : `ip:${ipKeyGenerator(req.ip)}`;

export function createLimiters() {
  return {
    login: make(15, 10),
    ai:    make(15, 30, actorKey),
    sms:   make(15, 20, actorKey),
    api:   make(15, 600, actorKey),
  };
}
