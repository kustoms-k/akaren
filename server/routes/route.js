import { Router } from 'express';

const router  = Router();
const ORS_KEY = process.env.ORS_API_KEY ?? '';
const TRV_KEY = process.env.TRAFIKVERKET_API_KEY ?? '';
const TRV_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

// ── Geocoding ─────────────────────────────────────────────────────────────────

async function geocodeORS(address) {
  const url = `https://api.openrouteservice.org/geocode/search`
    + `?api_key=${ORS_KEY}&text=${encodeURIComponent(address)}&boundary.country=SE&size=1`;
  const r = await fetch(url, { signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`ORS geocode ${r.status}`);
  const d = await r.json();
  const f = d.features?.[0];
  if (!f) throw new Error(`ORS: no result for "${address}"`);
  return f.geometry.coordinates; // [lon, lat]
}

async function geocodeNominatim(address) {
  const url = `https://nominatim.openstreetmap.org/search`
    + `?q=${encodeURIComponent(address)}&countrycodes=se&format=json&limit=1`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Akaren-TMS/1.0' } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const d = await r.json();
  if (!d[0]) throw new Error(`Nominatim: no result for "${address}"`);
  return [parseFloat(d[0].lon), parseFloat(d[0].lat)];
}

function geocode(address) {
  return ORS_KEY ? geocodeORS(address) : geocodeNominatim(address);
}

// ── Routing ───────────────────────────────────────────────────────────────────

async function routeORS(from, to) {
  const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv', {
    method:  'POST',
    headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates:     [from, to],
      units:           'km',
      geometry:        true,
      geometry_format: 'geojson',
      instructions:    true,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`ORS directions ${r.status}`);
  const data  = await r.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('ORS: no route returned');
  // ORS returns [lon,lat]; Leaflet wants [lat,lon]
  const polyline = (route.geometry?.coordinates ?? []).map(([lon, lat]) => [lat, lon]);
  return {
    polyline,
    distance_km:      Math.round(route.summary.distance * 10) / 10,
    duration_minutes: Math.round(route.summary.duration / 60),
  };
}

async function routeOSRM(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving`
    + `/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`OSRM ${r.status}`);
  const data  = await r.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('OSRM: no route');
  const polyline = (route.geometry?.coordinates ?? []).map(([lon, lat]) => [lat, lon]);
  return {
    polyline,
    distance_km:      Math.round(route.distance / 100) / 10,
    duration_minutes: Math.round(route.duration / 60),
  };
}

function getRoute(from, to) {
  return ORS_KEY ? routeORS(from, to) : routeOSRM(from, to);
}

// ── Trafikverket disruptions ──────────────────────────────────────────────────

async function fetchDisruptions() {
  if (!TRV_KEY) return [];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<REQUEST>
  <LOGIN authenticationkey="${TRV_KEY}"/>
  <QUERY objecttype="Situation" schemaversion="1.5" limit="20">
    <FILTER>
      <EQ name="Deviation.CountyNo" value="1"/>
    </FILTER>
    <INCLUDE>Deviation.MessageCode</INCLUDE>
    <INCLUDE>Deviation.SeverityCode</INCLUDE>
    <INCLUDE>Deviation.StartTime</INCLUDE>
    <INCLUDE>Deviation.EndTime</INCLUDE>
    <INCLUDE>Deviation.LocationDescriptor</INCLUDE>
    <INCLUDE>Deviation.Geometry.WGS84</INCLUDE>
    <INCLUDE>Deviation.Header</INCLUDE>
  </QUERY>
</REQUEST>`;

  try {
    const r = await fetch(TRV_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/xml' },
      body:    xml,
      signal:  AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const json = await r.json();

    // Check for API error (objecttype may not exist in all schemas)
    if (json?.RESPONSE?.RESULT?.[0]?.ERROR) return [];

    const situations = json?.RESPONSE?.RESULT?.[0]?.Situation ?? [];

    return situations.flatMap((sit) => {
      const devs = Array.isArray(sit.Deviation) ? sit.Deviation
        : sit.Deviation ? [sit.Deviation] : [];
      return devs.map((dev) => {
        let coordinates = null;
        const wgs84 = dev.Geometry?.WGS84;
        if (wgs84) {
          const m = wgs84.match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
          if (m) coordinates = [parseFloat(m[2]), parseFloat(m[1])]; // [lat, lon]
        }
        return {
          type:        dev.MessageCode        ?? 'unknown',
          severity:    dev.SeverityCode       ?? 0,
          location:    dev.LocationDescriptor ?? '',
          description: dev.Header             ?? '',
          coordinates,
        };
      }).filter((d) => d.coordinates);
    });
  } catch {
    return [];
  }
}

// ── POST /api/route ───────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { pickup, delivery } = req.body ?? {};
  if (!pickup?.trim() || !delivery?.trim()) {
    return res.status(400).json({ error: 'pickup and delivery are required' });
  }

  let fromCoord = null;
  let toCoord   = null;
  let polyline  = [];
  let distance_km      = null;
  let duration_minutes = null;

  try {
    [fromCoord, toCoord] = await Promise.all([
      geocode(pickup.trim()),
      geocode(delivery.trim()),
    ]);
    const r = await getRoute(fromCoord, toCoord);
    polyline         = r.polyline;
    distance_km      = r.distance_km;
    duration_minutes = r.duration_minutes;
  } catch (err) {
    console.warn('[route] geocode/route error:', err.message);
    if (fromCoord && toCoord) {
      polyline = [
        [fromCoord[1], fromCoord[0]],
        [toCoord[1],   toCoord[0]],
      ];
    }
  }

  const disruptions = await fetchDisruptions();

  // Estimate delay from disruption severity
  const delay_added_minutes = Math.min(
    disruptions.reduce((sum, d) => {
      if (d.severity >= 4) return sum + 30;
      if (d.severity >= 3) return sum + 15;
      if (d.severity >= 2) return sum + 5;
      return sum;
    }, 0),
    90, // cap at 90 min
  );

  const pickupEnc   = encodeURIComponent(pickup.trim());
  const deliveryEnc = encodeURIComponent(delivery.trim());

  res.json({
    polyline,
    distance_km,
    duration_minutes,
    pickup_coords:   fromCoord ? [fromCoord[1], fromCoord[0]] : null,
    delivery_coords: toCoord   ? [toCoord[1],   toCoord[0]]   : null,
    disruptions,
    delay_added_minutes,
    google_maps_url: `https://www.google.com/maps/dir/${pickupEnc}/${deliveryEnc}`,
    apple_maps_url:  `https://maps.apple.com/?saddr=${pickupEnc}&daddr=${deliveryEnc}&dirflg=r`,
  });
});

export default router;
