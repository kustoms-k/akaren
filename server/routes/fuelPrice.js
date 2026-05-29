import { Router } from 'express';
import db from '../db.js';

const router = Router();

// 2026 B7 diesel riksgenomsnitt (Drivmedelsleverantörernas förening)
const FALLBACK_PRICE = 21.50;
const CACHE_TTL_MS   = 6 * 60 * 60 * 1000; // 6 hours

const getCached = db.prepare(
  'SELECT price_per_litre, source, updated_at FROM fuel_price_cache ORDER BY id DESC LIMIT 1'
);
const insertCache = db.prepare(
  'INSERT INTO fuel_price_cache (price_per_litre, source, updated_at) VALUES (?, ?, ?)'
);

// ── source 1: fuelpricekungen.se ─────────────────────────────────────────
async function fetchFuelpriceKungen() {
  const res = await fetch('https://fuelpricekungen.se/api/prices', {
    signal:  AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'Akaren-TMS/1.0', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  // Try the most common field names in fuel price APIs
  const raw =
    data.diesel ??
    data.diesel_price ??
    data.diesel_sek ??
    data.price ??
    (Array.isArray(data) ? data.find((e) => /diesel/i.test(e.fuel ?? e.type ?? ''))?.price : undefined);

  const price = typeof raw === 'string' ? parseFloat(raw.replace(',', '.')) : raw;
  if (typeof price !== 'number' || !isFinite(price) || price < 10 || price > 35) {
    throw new Error('price out of expected range');
  }
  return price;
}

// ── source 2: Preem aktuella priser (HTML scrape) ─────────────────────────
async function fetchPreem() {
  const res = await fetch('https://www.preem.se/privat/drivmedel/aktuella-priser/', {
    signal:  AbortSignal.timeout(8000),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      Accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Look for diesel price in the HTML — Preem renders prices like "18,40" or "18.40"
  // near the word "diesel" (case-insensitive), within ~400 chars
  const segment = html.match(/diesel.{0,400}/i)?.[0] ?? html;
  const match   = segment.match(/(\d{2})[,\.](\d{2})/);
  if (!match) throw new Error('diesel price pattern not found');

  const price = parseFloat(`${match[1]}.${match[2]}`);
  if (price < 10 || price > 35) throw new Error('price out of expected range');
  return price;
}

// ── GET /api/fuel-price ───────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  // Serve from cache if still fresh
  const cached = getCached.get();
  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return res.json({
        price_per_litre: cached.price_per_litre,
        currency:        'SEK',
        source:          cached.source,
        updated_at:      cached.updated_at,
      });
    }
  }

  // Attempt live fetch in priority order
  let price  = FALLBACK_PRICE;
  let source = 'fallback';

  try {
    price  = await fetchFuelpriceKungen();
    source = 'fuelpricekungen';
  } catch {
    try {
      price  = await fetchPreem();
      source = 'preem';
    } catch {
      // Both live sources failed — use fallback; still cache it to avoid
      // hammering failing endpoints on every request
    }
  }

  const updatedAt = new Date().toISOString();
  insertCache.run(price, source, updatedAt);

  res.json({
    price_per_litre: price,
    currency:        'SEK',
    source,
    updated_at:      updatedAt,
  });
});

export default router;
