import rateLimit from 'express-rate-limit';

const json429 = (req, res) =>
  res.status(429).json({ error: 'Too many requests — try again later.' });

// Strict: auth endpoints (login, register) — brute-force protection
export const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // 15 minutes
  max:              12,
  standardHeaders:  true,
  legacyHeaders:    false,
  handler:          json429,
  skipSuccessfulRequests: false,
});

// Moderate: AI analysis calls — expensive, limit abuse
export const analyseLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              30,
  standardHeaders:  true,
  legacyHeaders:    false,
  handler:          json429,
});

// General: all other authenticated API calls
export const apiLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              300,
  standardHeaders:  true,
  legacyHeaders:    false,
  handler:          json429,
});
