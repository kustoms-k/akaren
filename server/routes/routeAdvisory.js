import { Router } from 'express';
import db from '../db.js';

const router = Router();

const ORS_KEY = process.env.ORS_API_KEY ?? '';
const TRV_KEY = process.env.TRAFIKVERKET_API_KEY ?? '';
const TRV_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

// Swedish LEZ zones: city districts that require Euro VI or permit
const LEZ_ZONES = ['hornsgatan', 'kungsholmen', 'södermalm', 'norrmalm', 'östermalm', 'gamla stan', 'vasastan'];

async function geocode(address) {
  if (ORS_KEY) {
    const layers = 'address,venue,locality,neighbourhood,localadmin';
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_KEY}`
      + `&text=${encodeURIComponent(address)}&boundary.country=SE&size=1&layers=${layers}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`ORS geocode HTTP ${r.status}`);
    const data = await r.json();
    const feature = data.features?.[0];
    if (!feature) throw new Error(`ORS geocode: no result for "${address}"`);
    return feature.geometry.coordinates; // [lon, lat]
  }
  // Nominatim fallback — free, no key required
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&countrycodes=se&format=json&limit=1`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Akaren-TMS/1.0 (transport management)' } });
  if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
  const data = await r.json();
  if (!data[0]) throw new Error(`Nominatim: no result for "${address}"`);
  return [parseFloat(data[0].lon), parseFloat(data[0].lat)]; // [lon, lat]
}

async function getRoute(from, to) {
  if (ORS_KEY) {
    const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv', {
      method: 'POST',
      headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [from, to], units: 'km', geometry: true, geometry_format: 'geojson' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`ORS route HTTP ${r.status}`);
    const data = await r.json();
    const route = data.routes?.[0];
    if (!route) throw new Error('ORS: no route returned');
    return {
      distance_km:  Math.round(route.summary.distance * 10) / 10,
      duration_min: Math.round(route.summary.duration / 60),
      geometry:     route.geometry?.coordinates ?? null,
    };
  }
  // OSRM fallback — free public routing, no key required
  const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`OSRM HTTP ${r.status}`);
  const data = await r.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('OSRM: no route returned');
  return {
    distance_km:  Math.round(route.distance / 100) / 10,
    duration_min: Math.round(route.duration / 60),
    geometry:     route.geometry?.coordinates ?? null,
  };
}

// Parse WGS84 POINT or first coord of LINESTRING from Trafikverket geometry string
function parseFirstCoord(wgs84) {
  if (!wgs84) return null;
  const m = wgs84.match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
  if (!m) return null;
  return { lon: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

// bbox: "minLon minLat, maxLon maxLat" string or null (fetch all Sweden)
async function getAlerts(bbox = null) {
  // Only use cache for the no-bbox (full-Sweden) case
  if (!bbox) {
    const cached = db.prepare('SELECT data, updated_at FROM road_alerts_cache ORDER BY id DESC LIMIT 1').get();
    if (cached) {
      const ageMs = Date.now() - new Date(cached.updated_at).getTime();
      if (ageMs < 30 * 60 * 1000) return JSON.parse(cached.data);
    }
  }

  if (!TRV_KEY) return [];

  const withinCond = bbox ? `<WITHIN name="Geometry.WGS84" shape="box" value="${bbox}"/>` : '';

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<REQUEST>
  <LOGIN authenticationkey="${TRV_KEY}"/>

  <QUERY objecttype="Situation" schemaversion="1.5" limit="100">
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
  </QUERY>

  <QUERY objecttype="RoadCondition" schemaversion="1.0" limit="300">
    <FILTER>
      <GT name="ConditionCode" value="1"/>
      ${withinCond}
    </FILTER>
    <INCLUDE>Id</INCLUDE>
    <INCLUDE>RoadNumber</INCLUDE>
    <INCLUDE>LocationText</INCLUDE>
    <INCLUDE>ConditionCode</INCLUDE>
    <INCLUDE>ConditionText</INCLUDE>
    <INCLUDE>Warning</INCLUDE>
    <INCLUDE>Geometry</INCLUDE>
    <INCLUDE>ModifiedTime</INCLUDE>
  </QUERY>
</REQUEST>`;

  const r = await fetch(TRV_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return [];
  const json = await r.json();

  const situations = json?.RESPONSE?.RESULT?.[0]?.Situation ?? [];
  const conditions  = json?.RESPONSE?.RESULT?.[1]?.RoadCondition ?? [];

  const incidents = situations.flatMap((s) =>
    (Array.isArray(s.Deviation) ? s.Deviation : s.Deviation ? [s.Deviation] : []).map((d) => ({
      id:        d.Id ?? s.Id,
      type:      'incident',
      subtype:   d.MessageType,
      road:      d.RoadNumber,
      location:  d.LocationText,
      severity:  d.SeverityText,
      end_time:  d.EndTime,
      _wgs84:    d.Geometry?.WGS84 ?? null,
    }))
  );

  const roadConds = conditions.map((c) => ({
    id:        c.Id,
    type:      'condition',
    road:      c.RoadNumber,
    location:  c.LocationText,
    condition: c.ConditionText,
    warnings:  c.Warning ? [].concat(c.Warning) : [],
    severity:  c.ConditionCode,
    _wgs84:    c.Geometry?.WGS84 ?? null,
  }));

  const alerts = [...incidents, ...roadConds];

  // Cache full-Sweden result for re-use
  if (!bbox) {
    const stripped  = alerts.map(({ _wgs84: _, ...rest }) => rest);
    db.prepare('INSERT INTO road_alerts_cache (data, updated_at) VALUES (?, ?)').run(
      JSON.stringify(stripped), new Date().toISOString()
    );
  }

  return alerts;
}

// POST /api/route-advisory  { pickup, delivery, weight_ton? }
router.post('/', async (req, res) => {
  const { pickup, delivery, weight_ton, lang = 'sv' } = req.body ?? {};
  if (!pickup?.trim() || !delivery?.trim()) {
    return res.status(400).json({ error: 'pickup and delivery are required' });
  }

  const result = {
    distance_km:    null,
    duration_min:   null,
    route_geometry: null,  // [[lon, lat], ...] for map polyline
    from_coord:     null,  // [lon, lat]
    to_coord:       null,  // [lon, lat]
    route_alerts:   [],
    lez_warning:    false,
    lez_zones:      [],
    recommendations: [],
  };

  // ── LEZ check (text-based on address strings) ─────────────────────────────
  const pickupLow   = pickup.toLowerCase();
  const deliveryLow = delivery.toLowerCase();
  const lezHits = LEZ_ZONES.filter((z) => pickupLow.includes(z) || deliveryLow.includes(z));
  result.lez_warning = lezHits.length > 0;
  result.lez_zones   = lezHits;

  // ── Geocode + route (ORS if key set, else Nominatim + OSRM fallback) ────────
  let fromCoord = null;
  let toCoord   = null;

  try {
    [fromCoord, toCoord] = await Promise.all([geocode(pickup.trim()), geocode(delivery.trim())]);
    const { distance_km, duration_min, geometry } = await getRoute(fromCoord, toCoord);
    result.distance_km    = distance_km;
    result.duration_min   = duration_min;
    result.route_geometry = geometry;
    result.from_coord     = fromCoord;
    result.to_coord       = toCoord;
  } catch (err) {
    console.warn('[route-advisory] geocode/route error:', err.message);
    // Still store coords for map even if routing failed
    if (fromCoord && toCoord) {
      result.from_coord = fromCoord;
      result.to_coord   = toCoord;
    }
  }

  // ── Trafikverket alerts — geographic filter pushed to API when coords known ──
  try {
    let bbox = null;
    if (fromCoord && toCoord) {
      const pad = 0.5; // degrees ~40 km padding around the route bounding box
      const minLon = (Math.min(fromCoord[0], toCoord[0]) - pad).toFixed(4);
      const maxLon = (Math.max(fromCoord[0], toCoord[0]) + pad).toFixed(4);
      const minLat = (Math.min(fromCoord[1], toCoord[1]) - pad).toFixed(4);
      const maxLat = (Math.max(fromCoord[1], toCoord[1]) + pad).toFixed(4);
      bbox = `${minLon} ${minLat}, ${maxLon} ${maxLat}`;
    }

    const allAlerts = await getAlerts(bbox);

    // RoadCondition was already filtered by WITHIN at API level.
    // Situation doesn't support WITHIN, so filter it client-side by bounding box.
    result.route_alerts = allAlerts.filter((a) => {
      if (!bbox || a.type !== 'incident') return true;
      const coord = parseFirstCoord(a._wgs84 ?? '');
      if (!coord) return false;
      const [minLon, minLatStr, , maxLon, maxLatStr] = bbox.replace(',', '').split(' ');
      return coord[0] >= parseFloat(minLon) && coord[0] <= parseFloat(maxLon) &&
             coord[1] >= parseFloat(minLatStr) && coord[1] <= parseFloat(maxLatStr);
    }).map(({ _wgs84, ...clean }) => ({
      ...clean,
      coord: parseFirstCoord(_wgs84 ?? ''),
    }));
  } catch (err) {
    console.warn('[route-advisory] Trafikverket error:', err.message);
  }

  // ── Build recommendations ─────────────────────────────────────────────────
  const recs = [];
  const en = lang === 'en';

  if (result.lez_warning) {
    recs.push(en
      ? 'Route passes through a LEZ zone — confirm the vehicle meets Euro VI standard or apply for an exemption.'
      : 'Rutten passerar en LEZ-zon — bekräfta att fordonet uppfyller Euro VI-kravet eller ansök om undantag.');
  }

  // Separate incident types for more specific messaging
  const accidents  = result.route_alerts.filter((a) => /olycka|accident/i.test(a.subtype ?? a.condition ?? ''));
  const roadworks  = result.route_alerts.filter((a) => /vägarbete|arbete/i.test(a.subtype ?? a.condition ?? ''));
  const icyRoads   = result.route_alerts.filter((a) => /is|halka|snö|frost/i.test(a.condition ?? a.location ?? ''));
  const otherAlerts = result.route_alerts.filter((a) => !accidents.includes(a) && !roadworks.includes(a) && !icyRoads.includes(a));

  if (accidents.length > 0) {
    const roads = [...new Set(accidents.map((a) => a.road).filter(Boolean))].slice(0, 3).join(', ');
    recs.push(en
      ? `Accident reported on route${roads ? ` (${roads})` : ''} — expect delays, keep safe following distance.`
      : `Olycka rapporterad på rutten${roads ? ` (${roads})` : ''} — räkna med förseningar, håll säkert avstånd.`);
  }
  if (roadworks.length > 0) {
    const roads = [...new Set(roadworks.map((a) => a.road).filter(Boolean))].slice(0, 3).join(', ');
    recs.push(en
      ? `Active roadworks near route${roads ? ` (${roads})` : ''} — reduced speed zones likely.`
      : `Pågående vägarbete längs rutten${roads ? ` (${roads})` : ''} — reducerade hastigheter gäller.`);
  }
  if (icyRoads.length > 0) {
    recs.push(en
      ? 'Ice or snow reported on road sections along this route — winter tyres required, reduce speed.'
      : 'Is eller snö rapporterat längs delar av rutten — vinterdäck krävs, sänk hastigheten.');
  }
  if (otherAlerts.length > 0 && accidents.length === 0 && roadworks.length === 0) {
    const roads = [...new Set(otherAlerts.map((a) => a.road).filter(Boolean))].slice(0, 3).join(', ');
    recs.push(en
      ? `Active road warnings near route${roads ? ` (${roads})` : ''} — check for alternative roads.`
      : `Aktiva vägvarningar nära rutten${roads ? ` (${roads})` : ''} — kontrollera alternativa vägar.`);
  }

  if (weight_ton && weight_ton > 10) {
    recs.push(en
      ? 'Heavy load (>10 tons) — check road bearing class and transport permit requirements.'
      : 'Tungt lass (>10 ton) — kontrollera bärighetsklass och eventuellt transporttillstånd.');
  }
  if (result.duration_min && result.duration_min > 270) {
    recs.push(en
      ? 'Drive time exceeds 4.5 h — plan for mandatory break under EU driving time regulations (EC 561/2006).'
      : 'Körtid överstiger 4,5 h — planera för obligatorisk rast enligt EG 561/2006 kör- och vilotidsregler.');
  }
  if (recs.length === 0) {
    recs.push(en
      ? 'Route looks clear. No active incidents or warnings along this stretch.'
      : 'Rutten ser normal ut. Inga aktiva händelser eller varningar längs sträckan.');
  }

  result.recommendations = recs;

  res.json(result);
});

export default router;
