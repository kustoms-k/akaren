import { Router } from 'express';

const router = Router();

const ORS_KEY = process.env.ORS_API_KEY ?? '';

async function geocode(address) {
  // neighbourhood layer handles Stockholm district names (Kungsholmen, Södermalm, etc.)
  const layers = 'address,venue,locality,neighbourhood,localadmin';
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_KEY}`
    + `&text=${encodeURIComponent(address)}&boundary.country=SE&size=1&layers=${layers}`;
  const r = await fetch(url, {
    signal:  AbortSignal.timeout(7000),
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`geocode HTTP ${r.status}`);
  const data = await r.json();
  const feature = data.features?.[0];
  if (!feature) throw new Error(`geocode: no result for "${address}"`);
  return feature.geometry.coordinates; // [lon, lat]
}

async function routeHgv(from, to) {
  const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv', {
    method:  'POST',
    headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ coordinates: [from, to], units: 'km' }),
    signal:  AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`route HTTP ${r.status}: ${body.slice(0, 120)}`);
  }
  const data    = await r.json();
  const summary = data.routes?.[0]?.summary;
  if (!summary) throw new Error('ORS: no route returned');
  return {
    distance_km:  Math.round(summary.distance * 10) / 10,
    duration_min: Math.round(summary.duration / 60),
  };
}

// POST /api/distance  { pickup: string, delivery: string }
router.post('/', async (req, res) => {
  if (!ORS_KEY) {
    return res.status(503).json({ error: 'no_key', message: 'ORS_API_KEY not set in .env' });
  }

  const { pickup, delivery } = req.body ?? {};
  if (!pickup?.trim() || !delivery?.trim()) {
    return res.status(400).json({ error: 'pickup and delivery are required' });
  }

  try {
    const [fromCoord, toCoord] = await Promise.all([
      geocode(pickup.trim()),
      geocode(delivery.trim()),
    ]);
    const { distance_km, duration_min } = await routeHgv(fromCoord, toCoord);
    res.json({ distance_km, duration_min });
  } catch (err) {
    console.error('[ORS]', err.message);
    res.status(502).json({ error: err.message });
  }
});

export default router;
