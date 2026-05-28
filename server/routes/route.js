import { Router }     from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path             from 'node:path';
import db               from '../db.js';

const router  = Router();
const ORS_KEY = process.env.ORS_API_KEY ?? '';
const TRV_KEY = process.env.TRAFIKVERKET_API_KEY ?? '';
const TRV_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fleet    = JSON.parse(readFileSync(path.join(__dirname, '../data/fleet.json'),     'utf8'));
const lezData  = JSON.parse(readFileSync(path.join(__dirname, '../data/lez_zones.json'), 'utf8'));

// ── Geometry helpers ─────────────────────────────────────────────────────────

// Ray-casting point-in-polygon. polygon is [[lon,lat],...] exterior ring.
function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Haversine distance in km between two [lon,lat] points.
function distKm([lon1, lat1], [lon2, lat2]) {
  const R   = 6371;
  const dLa = (lat2 - lat1) * Math.PI / 180;
  const dLo = (lon2 - lon1) * Math.PI / 180;
  const a   = Math.sin(dLa / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Check whether a route geometry (array of [lon,lat]) passes through a polygon.
// Samples every 4th point for performance.
function routeIntersectsPolygon(geometry, polygon) {
  for (let i = 0; i < geometry.length; i += 4) {
    const [lon, lat] = geometry[i];
    if (pointInPolygon(lon, lat, polygon)) return true;
  }
  return false;
}

// Check whether a route geometry passes within radius_km of a point.
function routeNearPoint(geometry, midpoint, radiusKm) {
  for (let i = 0; i < geometry.length; i += 4) {
    if (distKm(geometry[i], midpoint) <= radiusKm) return true;
  }
  return false;
}

// ── Congestion charge calculator ─────────────────────────────────────────────

function parseMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function congestionFee(zone, departureISO) {
  if (!departureISO) return 0;
  const d    = new Date(departureISO);
  const dow  = d.getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
  if (!zone.charged_days.includes(dow)) return 0;
  const mins = d.getHours() * 60 + d.getMinutes();
  for (const slot of zone.slots) {
    if (mins >= parseMins(slot.from) && mins <= parseMins(slot.to)) {
      return slot.sek;
    }
  }
  return 0;
}

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

async function routeORS(from, to, avoidPolygons = null) {
  const body = {
    coordinates:     [from, to],
    units:           'km',
    geometry:        true,
    geometry_format: 'geojson',
    instructions:    false,
  };
  if (avoidPolygons) {
    body.options = { avoid_polygons: avoidPolygons };
  }
  const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv', {
    method:  'POST',
    headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`ORS directions ${r.status}`);
  const data  = await r.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('ORS: no route returned');
  const geometry = route.geometry?.coordinates ?? []; // [[lon,lat], ...]
  const polyline = geometry.map(([lon, lat]) => [lat, lon]); // Leaflet [lat,lon]
  return {
    polyline,
    geometry,
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
  const geometry = route.geometry?.coordinates ?? [];
  const polyline = geometry.map(([lon, lat]) => [lat, lon]);
  return {
    polyline,
    geometry,
    distance_km:      Math.round(route.distance / 100) / 10,
    duration_minutes: Math.round(route.duration / 60),
  };
}

// ── Trafikverket disruptions ──────────────────────────────────────────────────

async function fetchDisruptions() {
  if (!TRV_KEY) return [];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<REQUEST>
  <LOGIN authenticationkey="${TRV_KEY}"/>
  <QUERY objecttype="Situation" schemaversion="1.5" limit="20">
    <FILTER><EQ name="Deviation.CountyNo" value="1"/></FILTER>
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
      method: 'POST', headers: { 'Content-Type': 'application/xml' },
      body: xml, signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const json = await r.json();
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
          if (m) coordinates = [parseFloat(m[2]), parseFloat(m[1])]; // [lat,lon] for Leaflet
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
  const { pickup, delivery, vehicle_id, departure_time } = req.body ?? {};
  if (!pickup?.trim() || !delivery?.trim()) {
    return res.status(400).json({ error: 'pickup and delivery are required' });
  }

  // ── Vehicle lookup ─────────────────────────────────────────────────────────
  const vehicle = vehicle_id
    ? (fleet.find((v) => v.id.toUpperCase() === String(vehicle_id).toUpperCase())
       ?? fleet.find((v) => v.namn.toLowerCase() === String(vehicle_id).toLowerCase())
       ?? null)
    : null;

  const isHeavy    = vehicle ? vehicle.maxLast_kg > 3500 : true; // assume heavy if unknown
  const euroKlass  = vehicle?.euro_klass ?? null;

  // ── Live diesel price from cache ────────────────────────────────────────────
  const fuelRow    = db.prepare(
    'SELECT price_per_litre FROM fuel_price_cache ORDER BY id DESC LIMIT 1'
  ).get();
  const dieselPrice = fuelRow?.price_per_litre ?? 18.50;

  // ── Geocode both ends ──────────────────────────────────────────────────────
  let fromCoord = null;
  let toCoord   = null;
  try {
    [fromCoord, toCoord] = await Promise.all([
      geocode(pickup.trim()),
      geocode(delivery.trim()),
    ]);
  } catch (err) {
    console.warn('[route] geocode error:', err.message);
    return res.json({
      polyline: [], distance_km: null, duration_minutes: null,
      pickup_coords: null, delivery_coords: null,
      disruptions: [], delay_added_minutes: 0,
      google_maps_url: `https://www.google.com/maps/dir/${encodeURIComponent(pickup)}/${encodeURIComponent(delivery)}`,
      apple_maps_url:  `https://maps.apple.com/?saddr=${encodeURIComponent(pickup)}&daddr=${encodeURIComponent(delivery)}&dirflg=r`,
      lez_compliant: true, lez_violations: [], direct_route: null, compliant_route: null,
      cost_breakdown: null, lez_zone_polygons: [], congestion_zone_polygons: [],
    });
  }

  // ── Direct route ────────────────────────────────────────────────────────────
  let directRoute = null;
  try {
    directRoute = ORS_KEY
      ? await routeORS(fromCoord, toCoord)
      : await routeOSRM(fromCoord, toCoord);
  } catch (err) {
    console.warn('[route] direct route error:', err.message);
    directRoute = {
      polyline: [[fromCoord[1], fromCoord[0]], [toCoord[1], toCoord[0]]],
      geometry: [fromCoord, toCoord],
      distance_km: null, duration_minutes: null,
    };
  }

  // ── LEZ compliance check ───────────────────────────────────────────────────
  const lezViolations    = [];
  const cZonesOnRoute    = [];
  const bridgeTolls      = [];
  const lezZonePolygons  = [];
  const congZonePolygons = [];

  if (directRoute.geometry?.length) {
    const geo = directRoute.geometry;

    // Check LEZ zones
    for (const zone of lezData.lez_zones) {
      if (routeIntersectsPolygon(geo, zone.polygon)) {
        lezZonePolygons.push({
          id:    zone.id,
          name:  zone.name,
          class: zone.class,
          polygon: zone.polygon,
        });
        if (isHeavy && euroKlass != null && euroKlass < zone.min_euro_class) {
          lezViolations.push({
            id:             zone.id,
            name:           zone.name,
            min_euro_class: zone.min_euro_class,
            vehicle_class:  euroKlass,
            fine_sek:       zone.fine_sek,
            info:           zone.info,
          });
        }
      }
    }

    // Check congestion zones
    for (const zone of lezData.congestion_zones) {
      if (routeIntersectsPolygon(geo, zone.polygon)) {
        const fee = congestionFee(zone, departure_time);
        congZonePolygons.push({
          id:      zone.id,
          name:    zone.name,
          polygon: zone.polygon,
        });
        if (fee > 0) {
          cZonesOnRoute.push({ id: zone.id, name: zone.name, fee_sek: fee });
        }
      }
    }

    // Check bridge tolls
    for (const toll of lezData.bridge_tolls) {
      if (routeNearPoint(geo, toll.midpoint, toll.radius_km)) {
        bridgeTolls.push({ id: toll.id, name: toll.name, toll_sek: toll.toll_sek });
      }
    }
  }

  const isLezCompliant = lezViolations.length === 0;

  // ── Compliant route (ORS avoid_polygons if needed) ─────────────────────────
  let compliantRoute = null;
  let lezAvoidanceApplied = false;

  if (!isLezCompliant && ORS_KEY && lezViolations.length > 0) {
    const avoidPolygons = {
      type: 'MultiPolygon',
      coordinates: lezViolations.map((v) => {
        const zone = lezData.lez_zones.find((z) => z.id === v.id);
        return [zone.polygon]; // each polygon is [[coords]] in MultiPolygon
      }),
    };
    try {
      compliantRoute = await routeORS(fromCoord, toCoord, avoidPolygons);
      lezAvoidanceApplied = true;
    } catch (err) {
      console.warn('[route] compliant route error:', err.message);
      compliantRoute = directRoute; // fallback — same route but flagged
    }
  }

  // The primary route shown on map = compliant if avoidance was applied, else direct
  const primaryRoute = compliantRoute ?? directRoute;

  // ── Cost breakdown ──────────────────────────────────────────────────────────
  const fuelPerKm = vehicle?.forbrukning_l_per_km ?? 0.32;

  function calcFuel(distKmVal) {
    if (!distKmVal) return null;
    return Math.round(distKmVal * fuelPerKm * dieselPrice);
  }

  const directDistKm    = directRoute?.distance_km    ?? null;
  const compliantDistKm = compliantRoute?.distance_km ?? directDistKm;
  const primaryDistKm   = primaryRoute?.distance_km   ?? null;
  const primaryDurMin   = primaryRoute?.duration_minutes ?? null;

  const bransleKr          = calcFuel(primaryDistKm);
  const directBransleKr    = calcFuel(directDistKm);
  const trangselskattKr    = cZonesOnRoute.reduce((s, z) => s + z.fee_sek, 0);
  const infrastrukturKr    = bridgeTolls.reduce((s, b) => s + b.toll_sek, 0);
  const lezBotRisk         = isLezCompliant ? 0 : lezViolations.reduce((s, v) => s + v.fine_sek, 0);
  const detourDistExtra    = (compliantDistKm && directDistKm)
    ? Math.max(0, compliantDistKm - directDistKm) : 0;
  const detourTimeExtra    = (compliantRoute && directRoute)
    ? Math.max(0, (compliantRoute.duration_minutes ?? 0) - (directRoute.duration_minutes ?? 0)) : 0;
  const detourMerkostnad   = calcFuel(detourDistExtra) ?? 0;

  const primaryTotal = (bransleKr ?? 0) + trangselskattKr + infrastrukturKr;
  const directTotal  = (directBransleKr ?? 0) + trangselskattKr + infrastrukturKr;

  const costBreakdown = {
    diesel_price_kr_l:     dieselPrice,
    forbrukning_l_per_km:  fuelPerKm,
    bransle_kr:            bransleKr,
    trangselskatt_kr:      trangselskattKr,
    infrastrukturavgift_kr: infrastrukturKr,
    lez_bot_risk_kr:       lezBotRisk,
    detour_merkostnad_kr:  lezAvoidanceApplied ? detourMerkostnad : 0,
    detour_km_extra:       lezAvoidanceApplied ? detourDistExtra  : 0,
    detour_min_extra:      lezAvoidanceApplied ? detourTimeExtra  : 0,
    total_kr:              primaryTotal,
    direct_total_kr:       directTotal,
    congestion_zones:      cZonesOnRoute,
    bridge_tolls:          bridgeTolls,
  };

  // ── Trafikverket disruptions ───────────────────────────────────────────────
  const disruptions = await fetchDisruptions();
  const delay_added_minutes = Math.min(
    disruptions.reduce((sum, d) => {
      if (d.severity >= 4) return sum + 30;
      if (d.severity >= 3) return sum + 15;
      if (d.severity >= 2) return sum + 5;
      return sum;
    }, 0),
    90,
  );

  // ── Response ───────────────────────────────────────────────────────────────
  const pickupEnc   = encodeURIComponent(pickup.trim());
  const deliveryEnc = encodeURIComponent(delivery.trim());

  res.json({
    // Primary fields (backwards-compatible)
    polyline:          primaryRoute.polyline,
    distance_km:       primaryDistKm,
    duration_minutes:  primaryDurMin,
    pickup_coords:     [fromCoord[1], fromCoord[0]],
    delivery_coords:   [toCoord[1],   toCoord[0]],
    disruptions,
    delay_added_minutes,
    google_maps_url:   `https://www.google.com/maps/dir/${pickupEnc}/${deliveryEnc}`,
    apple_maps_url:    `https://maps.apple.com/?saddr=${pickupEnc}&daddr=${deliveryEnc}&dirflg=r`,

    // LEZ / routing intelligence
    vehicle:              vehicle ? { id: vehicle.id, namn: vehicle.namn, euro_klass: vehicle.euro_klass } : null,
    lez_compliant:        isLezCompliant,
    lez_violations:       lezViolations,
    lez_avoidance_applied: lezAvoidanceApplied,
    direct_route:         directRoute  ? { polyline: directRoute.polyline,  distance_km: directDistKm,    duration_minutes: directRoute.duration_minutes }  : null,
    compliant_route:      compliantRoute ? { polyline: compliantRoute.polyline, distance_km: compliantDistKm, duration_minutes: compliantRoute.duration_minutes } : null,

    // Cost breakdown
    cost_breakdown: costBreakdown,

    // Zone polygons for map rendering
    lez_zone_polygons:       lezZonePolygons,
    congestion_zone_polygons: congZonePolygons,
  });
});

export default router;
