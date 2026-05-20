import { Router } from 'express';
import db from '../db.js';

const router = Router();

const API_KEY      = process.env.TRAFIKVERKET_API_KEY ?? '';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const API_URL      = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

const getCached  = db.prepare('SELECT data, updated_at FROM road_alerts_cache ORDER BY id DESC LIMIT 1');
const putCached  = db.prepare('INSERT INTO road_alerts_cache (data, updated_at) VALUES (?, ?)');

async function fetchAlerts() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<REQUEST>
  <LOGIN authenticationkey="${API_KEY}"/>
  <QUERY objecttype="RoadCondition" schemaversion="1.0">
    <FILTER>
      <GT name="ConditionCode" value="1"/>
    </FILTER>
    <INCLUDE>Id</INCLUDE>
    <INCLUDE>RoadNumber</INCLUDE>
    <INCLUDE>LocationText</INCLUDE>
    <INCLUDE>ConditionCode</INCLUDE>
    <INCLUDE>ConditionText</INCLUDE>
    <INCLUDE>ConditionInfo</INCLUDE>
    <INCLUDE>Warning</INCLUDE>
    <INCLUDE>Cause</INCLUDE>
    <INCLUDE>Measurement</INCLUDE>
    <INCLUDE>CountyNo</INCLUDE>
    <INCLUDE>ModifiedTime</INCLUDE>
  </QUERY>
</REQUEST>`;

  const r = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/xml' },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Trafikverket HTTP ${r.status}`);
  const json = await r.json();
  const items = json?.RESPONSE?.RESULT?.[0]?.RoadCondition ?? [];

  return items.map((item) => ({
    id:            item.Id,
    road:          item.RoadNumber,
    location:      item.LocationText,
    condition:     item.ConditionText,
    info:          item.ConditionInfo ?? [],
    warnings:      item.Warning       ?? [],
    causes:        item.Cause         ?? [],
    measurements:  item.Measurement   ?? [],
    severity:      item.ConditionCode,
    counties:      item.CountyNo      ?? [],
    modified_at:   item.ModifiedTime,
  }));
}

router.get('/', async (_req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ error: 'TRAFIKVERKET_API_KEY not set' });
  }

  const cached = getCached.get();
  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return res.json({ alerts: JSON.parse(cached.data), updated_at: cached.updated_at, source: 'cache' });
    }
  }

  try {
    const alerts    = await fetchAlerts();
    const updatedAt = new Date().toISOString();
    putCached.run(JSON.stringify(alerts), updatedAt);
    return res.json({ alerts, updated_at: updatedAt, source: 'trafikverket' });
  } catch (err) {
    console.error('[road-alerts]', err.message);
    if (cached) {
      return res.json({ alerts: JSON.parse(cached.data), updated_at: cached.updated_at, source: 'stale-cache' });
    }
    return res.status(502).json({ error: err.message });
  }
});

export default router;
