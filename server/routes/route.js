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

const fleetJson = JSON.parse(readFileSync(path.join(__dirname, '../data/fleet.json'),     'utf8'));
const lezData   = JSON.parse(readFileSync(path.join(__dirname, '../data/lez_zones.json'), 'utf8'));

// Index fleet.json by id for O(1) fuel-consumption lookup
const fleetJsonMap = Object.fromEntries(fleetJson.map((v) => [v.id.toUpperCase(), v]));

// ── DB queries ────────────────────────────────────────────────────────────────

const stmtFleet = db.prepare(`
  SELECT ext_id, namn, typ, lasttyp, max_last_kg, volym_m3,
         lez_godkand, euro_klass, timkostnad_sek, priskm_sek, startavgift_sek,
         forbrukning_l_per_km
  FROM company_fleet WHERE company_id = ?
`);

const stmtFuel = db.prepare(
  'SELECT price_per_litre FROM fuel_price_cache ORDER BY id DESC LIMIT 1'
);

// ── Geometry helpers ─────────────────────────────────────────────────────────

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

function distKm([lon1, lat1], [lon2, lat2]) {
  const R   = 6371;
  const dLa = (lat2 - lat1) * Math.PI / 180;
  const dLo = (lon2 - lon1) * Math.PI / 180;
  const a   = Math.sin(dLa / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function routeIntersectsPolygon(geometry, polygon) {
  for (let i = 0; i < geometry.length; i += 4) {
    const [lon, lat] = geometry[i];
    if (pointInPolygon(lon, lat, polygon)) return true;
  }
  return false;
}

function routeNearPoint(geometry, midpoint, radiusKm) {
  for (let i = 0; i < geometry.length; i += 4) {
    if (distKm(geometry[i], midpoint) <= radiusKm) return true;
  }
  return false;
}

// ── Cargo suitability filter ─────────────────────────────────────────────────

function isSuitable(vehicle, weightKg, lasttyp) {
  if (weightKg && vehicle.max_last_kg && vehicle.max_last_kg < weightKg) return false;
  const lt  = (lasttyp ?? '').toLowerCase();
  const typ = (vehicle.typ ?? '').toLowerCase();
  if ((lt.includes('kyl') || lt.includes('frys')) && !typ.includes('kyl')) return false;
  if ((lt.includes('tank') || lt.includes('flytande') || lt.includes('adr'))
    && !typ.includes('tank')) return false;
  if ((lt.includes('kran') || lt.includes('lyft')) && !typ.includes('kran')) return false;
  return true;
}

// ── Congestion charge ─────────────────────────────────────────────────────────

function parseMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function congestionFee(zone, departureISO) {
  if (!departureISO) return 0;
  const d   = new Date(departureISO);
  const dow = d.getDay();
  if (!zone.charged_days.includes(dow)) return 0;
  const mins = d.getHours() * 60 + d.getMinutes();
  for (const slot of zone.slots) {
    if (mins >= parseMins(slot.from) && mins <= parseMins(slot.to)) return slot.sek;
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
  return f.geometry.coordinates;
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
    coordinates: [from, to], units: 'km',
    geometry: true, geometry_format: 'geojson', instructions: false,
  };
  if (avoidPolygons) body.options = { avoid_polygons: avoidPolygons };
  const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv', {
    method: 'POST',
    headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`ORS directions ${r.status}`);
  const data  = await r.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('ORS: no route returned');
  const geometry = route.geometry?.coordinates ?? [];
  return {
    polyline:         geometry.map(([lon, lat]) => [lat, lon]),
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
  return {
    polyline:         geometry.map(([lon, lat]) => [lat, lon]),
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
    <INCLUDE>Deviation.MessageCode</INCLUDE><INCLUDE>Deviation.SeverityCode</INCLUDE>
    <INCLUDE>Deviation.LocationDescriptor</INCLUDE><INCLUDE>Deviation.Geometry.WGS84</INCLUDE>
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
        const wgs84 = dev.Geometry?.WGS84;
        let coordinates = null;
        if (wgs84) {
          const m = wgs84.match(/(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
          if (m) coordinates = [parseFloat(m[2]), parseFloat(m[1])];
        }
        return { type: dev.MessageCode ?? 'unknown', severity: dev.SeverityCode ?? 0,
          location: dev.LocationDescriptor ?? '', description: dev.Header ?? '', coordinates };
      }).filter((d) => d.coordinates);
    });
  } catch { return []; }
}

// ── Cost calculation for one vehicle ─────────────────────────────────────────

function calcVehicleCost(vehicle, directGeo, directKm, compliantKm, cZones, bridges, dieselPrice) {
  const isHeavy  = (vehicle.max_last_kg ?? 0) > 3500;
  const euroKl   = vehicle.euro_klass ?? 6;
  const forbruk  = vehicle.forbrukning_l_per_km
    ?? fleetJsonMap[vehicle.ext_id?.toUpperCase()]?.forbrukning_l_per_km
    ?? 0.32;

  // LEZ check for this vehicle
  const violations = directGeo?.length
    ? lezData.lez_zones.filter((z) =>
        routeIntersectsPolygon(directGeo, z.polygon) &&
        isHeavy && euroKl < z.min_euro_class
      )
    : [];

  const compliant    = violations.length === 0;
  const routeKm      = compliant ? (directKm ?? 0) : (compliantKm ?? directKm ?? 0);
  const detourKmExtra= compliant ? 0 : Math.max(0, (compliantKm ?? 0) - (directKm ?? 0));

  const fuelKr       = Math.round(routeKm * forbruk * dieselPrice);
  const congKr       = cZones.reduce((s, z) => s + z.fee_sek, 0);
  const tollsKr      = bridges.reduce((s, b) => s + b.toll_sek, 0);
  const detourKr     = Math.round(detourKmExtra * forbruk * dieselPrice);
  const totalKr      = fuelKr + congKr + tollsKr + detourKr;

  return {
    ext_id:         vehicle.ext_id,
    namn:           vehicle.namn,
    typ:            vehicle.typ,
    euro_klass:     vehicle.euro_klass,
    lez_compliant:  compliant,
    lez_violations: violations.map((z) => z.name),
    distance_km:    routeKm,
    detour_km:      detourKmExtra,
    forbrukning:    forbruk,
    cost: {
      fuel_kr:        fuelKr,
      congestion_kr:  congKr,
      tolls_kr:       tollsKr,
      detour_kr:      detourKr,
      total_kr:       totalKr,
    },
  };
}

// ── POST /api/route ───────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { pickup, delivery, vehicle_id, departure_time, weight_kg, lasttyp } = req.body ?? {};
  if (!pickup?.trim() || !delivery?.trim()) {
    return res.status(400).json({ error: 'pickup and delivery are required' });
  }

  // ── Live diesel price ──────────────────────────────────────────────────────
  const fuelRow     = stmtFuel.get();
  const dieselPrice = fuelRow?.price_per_litre ?? 18.50;

  // ── Company fleet from DB (with fleet.json fuel-consumption fallback) ──────
  const dbFleet = req.companyId ? stmtFleet.all(req.companyId) : [];

  // ── Specific vehicle from the AI recommendation ────────────────────────────
  const findVehicle = (id) => {
    if (!id) return null;
    const up = String(id).toUpperCase();
    return dbFleet.find((v) => v.ext_id?.toUpperCase() === up)
      ?? dbFleet.find((v) => v.namn?.toLowerCase() === String(id).toLowerCase())
      ?? null;
  };
  const vehicle = findVehicle(vehicle_id);

  // ── Geocode ────────────────────────────────────────────────────────────────
  let fromCoord = null, toCoord = null;
  try {
    [fromCoord, toCoord] = await Promise.all([
      geocode(pickup.trim()), geocode(delivery.trim()),
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
      vehicle_comparison: [], optimal_vehicle: null, reasoning: null,
    });
  }

  // ── Direct route ───────────────────────────────────────────────────────────
  let directRoute = null;
  try {
    directRoute = ORS_KEY
      ? await routeORS(fromCoord, toCoord)
      : await routeOSRM(fromCoord, toCoord);
  } catch (err) {
    console.warn('[route] direct route error:', err.message);
    directRoute = {
      polyline:         [[fromCoord[1], fromCoord[0]], [toCoord[1], toCoord[0]]],
      geometry:         [fromCoord, toCoord],
      distance_km:      null,
      duration_minutes: null,
    };
  }

  // ── Zone checks on direct route ────────────────────────────────────────────
  const lezViolations    = [];
  const cZonesOnRoute    = [];
  const bridgeTolls      = [];
  const lezZonePolygons  = [];
  const congZonePolygons = [];

  const geo       = directRoute.geometry ?? [];
  const isHeavy   = vehicle ? vehicle.max_last_kg > 3500 : true;
  const euroKlass = vehicle?.euro_klass ?? null;

  for (const zone of lezData.lez_zones) {
    if (routeIntersectsPolygon(geo, zone.polygon)) {
      lezZonePolygons.push({ id: zone.id, name: zone.name, class: zone.class, polygon: zone.polygon });
      if (isHeavy && euroKlass != null && euroKlass < zone.min_euro_class) {
        lezViolations.push({ id: zone.id, name: zone.name,
          min_euro_class: zone.min_euro_class, vehicle_class: euroKlass, fine_sek: zone.fine_sek });
      }
    }
  }
  for (const zone of lezData.congestion_zones) {
    if (routeIntersectsPolygon(geo, zone.polygon)) {
      congZonePolygons.push({ id: zone.id, name: zone.name, polygon: zone.polygon });
      const fee = congestionFee(zone, departure_time);
      if (fee > 0) cZonesOnRoute.push({ id: zone.id, name: zone.name, fee_sek: fee });
    }
  }
  for (const toll of lezData.bridge_tolls) {
    if (routeNearPoint(geo, toll.midpoint, toll.radius_km)) {
      bridgeTolls.push({ id: toll.id, name: toll.name, toll_sek: toll.toll_sek });
    }
  }

  const isLezCompliant = lezViolations.length === 0;

  // ── Compliant detour route (only if zones are violated AND ORS key exists) ──
  let compliantRoute      = null;
  let lezAvoidanceApplied = false;

  if (!isLezCompliant && ORS_KEY) {
    const avoidPolygons = {
      type: 'MultiPolygon',
      coordinates: lezViolations.map((v) => {
        const zone = lezData.lez_zones.find((z) => z.id === v.id);
        return [zone.polygon];
      }),
    };
    try {
      compliantRoute       = await routeORS(fromCoord, toCoord, avoidPolygons);
      lezAvoidanceApplied  = true;
    } catch (err) {
      console.warn('[route] compliant route error:', err.message);
      compliantRoute = directRoute;
    }
  }

  const directKm    = directRoute?.distance_km    ?? null;
  const compliantKm = compliantRoute?.distance_km ?? directKm;
  const primaryRoute = compliantRoute ?? directRoute;

  // ── Cost breakdown for the requested vehicle ───────────────────────────────
  const primaryVehicle = vehicle ?? dbFleet[0] ?? null;
  const forbruk = primaryVehicle?.forbrukning_l_per_km
    ?? fleetJsonMap[primaryVehicle?.ext_id?.toUpperCase()]?.forbrukning_l_per_km
    ?? 0.32;

  const primaryKm   = primaryRoute?.distance_km ?? 0;
  const fuelKr      = Math.round(primaryKm * forbruk * dieselPrice);
  const congKr      = cZonesOnRoute.reduce((s, z) => s + z.fee_sek, 0);
  const tollsKr     = bridgeTolls.reduce((s, b) => s + b.toll_sek, 0);
  const lezBotRisk  = isLezCompliant ? 0 : lezViolations.reduce((s, v) => s + v.fine_sek, 0);
  const detourExtra = lezAvoidanceApplied
    ? Math.max(0, (compliantKm ?? 0) - (directKm ?? 0)) : 0;
  const detourKr    = Math.round(detourExtra * forbruk * dieselPrice);

  const costBreakdown = {
    diesel_price_kr_l:      dieselPrice,
    forbrukning_l_per_km:   forbruk,
    bransle_kr:             fuelKr,
    trangselskatt_kr:       congKr,
    infrastrukturavgift_kr: tollsKr,
    lez_bot_risk_kr:        lezBotRisk,
    detour_merkostnad_kr:   detourKr,
    detour_km_extra:        detourExtra,
    detour_min_extra:       lezAvoidanceApplied
      ? Math.max(0, (compliantRoute?.duration_minutes ?? 0) - (directRoute?.duration_minutes ?? 0)) : 0,
    total_kr:               fuelKr + congKr + tollsKr + detourKr,
    direct_total_kr:        Math.round((directKm ?? 0) * forbruk * dieselPrice) + congKr + tollsKr,
    congestion_zones:       cZonesOnRoute,
    bridge_tolls:           bridgeTolls,
  };

  // ── Multi-vehicle comparison ───────────────────────────────────────────────
  const weightKg       = weight_kg ? Number(weight_kg) : null;
  const candidates     = dbFleet.filter((v) => isSuitable(v, weightKg, lasttyp));

  const comparison = candidates
    .map((v) => calcVehicleCost(v, geo, directKm, compliantKm, cZonesOnRoute, bridgeTolls, dieselPrice))
    .sort((a, b) => {
      if (a.lez_compliant !== b.lez_compliant) return a.lez_compliant ? -1 : 1;
      return a.cost.total_kr - b.cost.total_kr;
    });

  // Optimal = cheapest compliant (or cheapest overall if all non-compliant)
  const compliantCandidates = comparison.filter((v) => v.lez_compliant);
  const optimal             = compliantCandidates[0] ?? comparison[0] ?? null;

  // Build a human-readable reasoning string for the recommendation
  let reasoning = null;
  if (optimal && comparison.length > 1) {
    const aiVehicle  = comparison.find((v) => v.ext_id === (vehicle?.ext_id ?? ''));
    const savedKr    = aiVehicle && aiVehicle.ext_id !== optimal.ext_id
      ? aiVehicle.cost.total_kr - optimal.cost.total_kr : null;
    const savedMin   = aiVehicle && aiVehicle.detour_km > 0 && optimal.lez_compliant && aiVehicle.lez_compliant
      ? null
      : (aiVehicle && !aiVehicle.lez_compliant && optimal.lez_compliant ? optimal.detour_km === 0 : false)
        ? null : null;

    if (!aiVehicle || aiVehicle.ext_id === optimal.ext_id) {
      reasoning = optimal.lez_compliant
        ? `${optimal.ext_id} (Euro ${optimal.euro_klass}) är det mest kostnadseffektiva fordonet och är godkänt för alla zoner på rutten.`
        : `${optimal.ext_id} (Euro ${optimal.euro_klass}) är det billigaste tillgängliga fordonet men uppfyller inte LEZ-kraven.`;
    } else if (savedKr != null && savedKr > 0) {
      const lezNote = !aiVehicle.lez_compliant && optimal.lez_compliant
        ? ` Sparar ${optimal.detour_km > 0 ? `${Math.round(optimal.detour_km)} km omväg och ` : ''}${savedKr} kr jämfört med ${aiVehicle.ext_id} (Euro ${aiVehicle.euro_klass}) som måste ta omväg.`
        : ` Sparar ${savedKr} kr jämfört med ${aiVehicle.ext_id}.`;
      reasoning = `${optimal.ext_id} (Euro ${optimal.euro_klass}) rekommenderas.${lezNote}`;
    } else if (!aiVehicle.lez_compliant && optimal.lez_compliant) {
      const detourKmRounded = Math.round((aiVehicle.detour_km ?? 0));
      const detourMin       = Math.round(detourKmRounded / 70 * 60); // rough estimate
      reasoning = `${optimal.ext_id} (Euro ${optimal.euro_klass}) vald — får köra genom Miljözon och sparar ${detourMin > 0 ? `${detourMin} min och ` : ''}${Math.abs(aiVehicle.cost.total_kr - optimal.cost.total_kr)} kr jämfört med ${aiVehicle.ext_id} (Euro ${aiVehicle.euro_klass}) som måste ta omväg.`;
    } else {
      reasoning = `${optimal.ext_id} (Euro ${optimal.euro_klass}) är det mest kostnadseffektiva fordonet för denna rutt.`;
    }
  } else if (optimal) {
    reasoning = optimal.lez_compliant
      ? `${optimal.ext_id} (Euro ${optimal.euro_klass}) är godkänt för alla zoner på rutten.`
      : `${optimal.ext_id} (Euro ${optimal.euro_klass}) uppfyller inte LEZ-kraven på rutten.`;
  }

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

  const pickupEnc   = encodeURIComponent(pickup.trim());
  const deliveryEnc = encodeURIComponent(delivery.trim());

  res.json({
    polyline:          primaryRoute.polyline,
    distance_km:       primaryRoute.distance_km,
    duration_minutes:  primaryRoute.duration_minutes,
    pickup_coords:     [fromCoord[1], fromCoord[0]],
    delivery_coords:   [toCoord[1],   toCoord[0]],
    disruptions,
    delay_added_minutes,
    google_maps_url:   `https://www.google.com/maps/dir/${pickupEnc}/${deliveryEnc}`,
    apple_maps_url:    `https://maps.apple.com/?saddr=${pickupEnc}&daddr=${deliveryEnc}&dirflg=r`,

    vehicle:               vehicle ? { id: vehicle.ext_id, namn: vehicle.namn, euro_klass: vehicle.euro_klass } : null,
    lez_compliant:         isLezCompliant,
    lez_violations:        lezViolations,
    lez_avoidance_applied: lezAvoidanceApplied,
    direct_route:          directRoute  ? { polyline: directRoute.polyline,  distance_km: directKm,    duration_minutes: directRoute.duration_minutes } : null,
    compliant_route:       compliantRoute ? { polyline: compliantRoute.polyline, distance_km: compliantKm, duration_minutes: compliantRoute.duration_minutes } : null,

    cost_breakdown: costBreakdown,

    lez_zone_polygons:        lezZonePolygons,
    congestion_zone_polygons: congZonePolygons,

    vehicle_comparison: comparison,
    optimal_vehicle:    optimal,
    reasoning,
  });
});

export default router;
