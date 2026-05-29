import { Router } from 'express';
import db from '../db.js';

const router = Router();

const API_KEY      = process.env.TRAFIKVERKET_API_KEY ?? '';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const API_URL      = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

const getCached = db.prepare('SELECT data, updated_at FROM road_alerts_cache ORDER BY id DESC LIMIT 1');
const putCached = db.prepare('INSERT INTO road_alerts_cache (data, updated_at) VALUES (?, ?)');

// Single request — two QUERY blocks: Situation (incidents) + RoadCondition (surface)
function buildXml(key) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<REQUEST>
  <LOGIN authenticationkey="${key}"/>

  <QUERY objecttype="Situation" schemaversion="1.5" limit="200">
    <FILTER>
      <EQ name="Deleted" value="false"/>
    </FILTER>
    <INCLUDE>Id</INCLUDE>
    <INCLUDE>Deviation.Id</INCLUDE>
    <INCLUDE>Deviation.MessageType</INCLUDE>
    <INCLUDE>Deviation.MessageCode</INCLUDE>
    <INCLUDE>Deviation.LocationText</INCLUDE>
    <INCLUDE>Deviation.RoadNumber</INCLUDE>
    <INCLUDE>Deviation.SeverityText</INCLUDE>
    <INCLUDE>Deviation.StartTime</INCLUDE>
    <INCLUDE>Deviation.EndTime</INCLUDE>
    <INCLUDE>Deviation.Geometry</INCLUDE>
    <INCLUDE>Deviation.CountyNo</INCLUDE>
  </QUERY>

  <QUERY objecttype="RoadCondition" schemaversion="1.0" limit="500">
    <FILTER>
      <GT name="ConditionCode" value="1"/>
    </FILTER>
    <INCLUDE>Id</INCLUDE>
    <INCLUDE>RoadNumber</INCLUDE>
    <INCLUDE>LocationText</INCLUDE>
    <INCLUDE>ConditionCode</INCLUDE>
    <INCLUDE>ConditionText</INCLUDE>
    <INCLUDE>Warning</INCLUDE>
    <INCLUDE>CountyNo</INCLUDE>
    <INCLUDE>Geometry</INCLUDE>
    <INCLUDE>ModifiedTime</INCLUDE>
  </QUERY>
</REQUEST>`;
}

function parseFirstCoord(wgs84) {
  if (!wgs84) return null;
  const m = String(wgs84).match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

async function fetchTrafikverket() {
  const r = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/xml' },
    body:    buildXml(API_KEY),
    signal:  AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Trafikverket HTTP ${r.status}`);
  const json = await r.json();

  // RESULT[0] = Situation, RESULT[1] = RoadCondition
  const situations = json?.RESPONSE?.RESULT?.[0]?.Situation ?? [];
  const conditions  = json?.RESPONSE?.RESULT?.[1]?.RoadCondition ?? [];

  const incidents = situations.flatMap((s) =>
    (Array.isArray(s.Deviation) ? s.Deviation : s.Deviation ? [s.Deviation] : []).map((d) => ({
      id:         d.Id   ?? s.Id,
      type:       'incident',
      subtype:    d.MessageType,
      message:    d.MessageCode,
      road:       d.RoadNumber,
      location:   d.LocationText,
      severity:   d.SeverityText,
      start_time: d.StartTime,
      end_time:   d.EndTime,
      counties:   d.CountyNo ? [].concat(d.CountyNo) : [],
      coord:      parseFirstCoord(d.Geometry?.WGS84),
    }))
  );

  const roadConds = conditions.map((c) => ({
    id:          c.Id,
    type:        'condition',
    road:        c.RoadNumber,
    location:    c.LocationText,
    condition:   c.ConditionText,
    warnings:    c.Warning ? [].concat(c.Warning) : [],
    severity:    c.ConditionCode,
    counties:    c.CountyNo ? [].concat(c.CountyNo) : [],
    modified_at: c.ModifiedTime,
    coord:       parseFirstCoord(c.Geometry?.WGS84),
  }));

  return [...incidents, ...roadConds];
}

router.get('/', async (_req, res) => {
  const cached = getCached.get();
  if (cached) {
    const ageMs = Date.now() - new Date(cached.updated_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return res.json({ alerts: JSON.parse(cached.data), updated_at: cached.updated_at, source: 'cache' });
    }
  }

  // No key — return empty gracefully; frontend can still show the rest of the UI
  if (!API_KEY) {
    return res.json({ alerts: [], updated_at: new Date().toISOString(), source: 'no_key' });
  }

  try {
    const alerts    = await fetchTrafikverket();
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
