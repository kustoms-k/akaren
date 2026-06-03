import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import 'leaflet/dist/leaflet.css';

const FONT    = "'Geist', system-ui, sans-serif";
const BORDER  = '#e6e2da';
const SURF    = '#fafaf8';
const TEXT    = '#1c1917';
const MUTED   = '#6b6359';
const DIM     = '#a09590';
const G_GREEN = '#16a34a';
const AMBER   = '#d97706';
const RED     = '#e74c3c';
const ACCENT  = '#4361ee';

let L = null;
async function loadLeaflet() {
  if (L) return L;
  const mod = await import('leaflet');
  L = mod.default ?? mod;
  if (!document.getElementById('lf-style-override')) {
    const s = document.createElement('style');
    s.id = 'lf-style-override';
    s.textContent = `
      .leaflet-popup-content-wrapper{border-radius:10px!important;box-shadow:0 4px 20px rgba(0,0,0,0.15)!important;padding:0!important;font-family:'Geist', system-ui, sans-serif!important;}
      .leaflet-popup-content{margin:10px 14px!important;font-size:12px!important;line-height:1.55!important;color:#1a1a2e!important;}
      .leaflet-popup-tip-container{display:none!important;}
      .leaflet-popup-close-button{top:6px!important;right:8px!important;color:#999!important;font-size:16px!important;}
      .leaflet-control-zoom{border:none!important;box-shadow:0 2px 10px rgba(0,0,0,0.15)!important;border-radius:8px!important;overflow:hidden!important;}
      .leaflet-control-zoom a{width:28px!important;height:28px!important;line-height:28px!important;font-size:16px!important;color:#444!important;background:#fff!important;}
      .leaflet-control-zoom a:hover{background:#f5f5f5!important;}
      .leaflet-control-attribution{font-size:9px!important;background:rgba(255,255,255,0.6)!important;}
    `;
    document.head.appendChild(s);
  }
  return L;
}

function pickupIcon(Lf) {
  return Lf.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="position:relative;width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#22c55e;border:3px solid #fff;box-shadow:0 3px 12px rgba(34,197,94,0.45)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(45deg)">
          <svg width="18" height="13" viewBox="0 0 20 14" fill="white">
            <rect x="0" y="2" width="11" height="9" rx="1.5"/>
            <path d="M11 3.5 L11 11 L17.5 11 L17.5 7 L14.5 3.5 Z"/>
            <circle cx="4"  cy="11" r="2" fill="#22c55e" stroke="white" stroke-width="1.2"/>
            <circle cx="14" cy="11" r="2" fill="#22c55e" stroke="white" stroke-width="1.2"/>
          </svg>
        </div>
      </div>
    </div>`,
    iconSize: [36, 44], iconAnchor: [18, 44],
  });
}

function deliveryIcon(Lf) {
  return Lf.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="position:relative;width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${ACCENT};border:3px solid #fff;box-shadow:0 3px 12px rgba(67,97,238,0.45)">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(45deg)">
          <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="2,7 6,11 14,3"/>
          </svg>
        </div>
      </div>
    </div>`,
    iconSize: [36, 44], iconAnchor: [18, 44],
  });
}

function disruptionIcon(Lf) {
  return Lf.divIcon({
    className: '',
    html: `<div style="position:relative;width:28px;height:24px">
      <div style="width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:24px solid #f59e0b;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25))"></div>
      <span style="position:absolute;top:9px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:800;color:#fff;font-family:'Geist', system-ui, sans-serif;line-height:1">!</span>
    </div>`,
    iconSize: [28, 24], iconAnchor: [14, 24],
  });
}

const fmtKr = (n, locale = 'sv-SE') =>
  n == null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n) + ' kr';

// ── CostRow ────────────────────────────────────────────────────────────────────
function CostRow({ label, value, detail, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <span style={{ fontSize: 11, color: accent ?? MUTED, flexShrink: 0 }}>{label}</span>
        {detail && (
          <span style={{ fontSize: 10, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detail}
          </span>
        )}
      </div>
      <span style={{
        fontSize: 12, fontWeight: 600, color: accent ?? TEXT,
        fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
      }}>
        {value}
      </span>
    </div>
  );
}

// ── CostPanel ─────────────────────────────────────────────────────────────────
function CostPanel({ cost, violations, t, locale }) {
  if (!cost) return null;
  const cm       = t.map.cost;
  const hasLez   = violations?.length > 0;
  const hasCong  = (cost.trangselskatt_kr ?? 0) > 0;
  const hasBridg = (cost.infrastrukturavgift_kr ?? 0) > 0;
  const hasFine  = (cost.lez_bot_risk_kr ?? 0) > 0;
  const hasDet   = (cost.detour_km_extra ?? 0) > 0;
  const hasLab   = (cost.labour_kr ?? 0) > 0 && cost.labour_hours != null;
  const hasKm    = cost.distance_km != null && cost.distance_km > 0;
  const hasDur   = cost.duration_minutes != null;

  return (
    <div style={{
      background: SURF, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '12px 14px', fontFamily: FONT,
    }}>
      {/* Header */}
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: DIM, marginBottom: 10,
      }}>
        {cm.heading}
      </div>

      {/* Itemised rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>

        {/* Distance */}
        {hasKm && (
          <CostRow
            label={cm.distance}
            value={cm.distanceMil(Math.round(cost.distance_km), Math.round(cost.distance_km / 10 * 10) / 10)}
          />
        )}

        {/* Drive time */}
        {hasDur && (
          <CostRow
            label={cm.driveTime}
            value={cm.driveTimeFmt(Math.round(cost.duration_minutes))}
            detail={hasLab ? cm.driveTimeNote : undefined}
          />
        )}

        {/* Fuel */}
        <CostRow
          label={cm.fuel}
          value={fmtKr(cost.bransle_kr, locale)}
          detail={cost.fuel_litres != null && cost.diesel_price_kr_l != null
            ? cm.fuelCalc(cost.fuel_litres, cost.diesel_price_kr_l.toFixed(2))
            : undefined}
        />

        {/* Labour */}
        {hasLab && (
          <CostRow
            label={cm.labour}
            value={fmtKr(cost.labour_kr, locale)}
            detail={cost.labour_rate_kr_h != null
              ? cm.labourCalc(cost.labour_hours, cost.labour_rate_kr_h)
              : undefined}
          />
        )}

        {/* Congestion charge */}
        {hasCong && (
          <CostRow
            label={cm.congestion}
            value={fmtKr(cost.trangselskatt_kr, locale)}
            detail={cost.congestion_zones?.[0]?.name}
            accent={AMBER}
          />
        )}

        {/* Bridge toll */}
        {hasBridg && (
          <CostRow
            label={cm.bridge}
            value={fmtKr(cost.infrastrukturavgift_kr, locale)}
            detail={cost.bridge_tolls?.[0]?.name}
          />
        )}

        {/* LEZ fine risk */}
        {hasFine && (
          <CostRow
            label={cm.lezFine}
            value={fmtKr(cost.lez_bot_risk_kr, locale)}
            detail={cm.lezFineNote}
            accent={RED}
          />
        )}

        {/* Detour extra */}
        {hasDet && (
          <CostRow
            label={hasCong || hasBridg
              ? cm.detourExtraFull(cost.detour_km_extra, cost.detour_min_extra)
              : cm.detourExtra}
            value={'+' + fmtKr(cost.detour_merkostnad_kr, locale)}
            accent={AMBER}
          />
        )}

        {/* Total cost to run */}
        <div style={{
          borderTop: `1px solid ${BORDER}`, marginTop: 4, paddingTop: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{cm.totalRunCost}</span>
          <span style={{
            fontSize: 14, fontWeight: 700, color: TEXT,
            fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtKr(cost.total_kr, locale)}
          </span>
        </div>
      </div>

      {/* Compliance status */}
      <div style={{ marginTop: 10 }}>
        {hasLez ? (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            padding: '7px 10px',
            background: hasDet ? 'rgba(34,197,94,0.06)' : 'rgba(231,76,60,0.06)',
            border: `1px solid ${hasDet ? 'rgba(34,197,94,0.2)' : 'rgba(231,76,60,0.2)'}`,
            borderRadius: 7,
          }}>
            <span style={{ fontSize: 13, marginTop: 1 }}>{hasDet ? '✅' : '⚠️'}</span>
            <span style={{ fontSize: 11, color: '#444', lineHeight: 1.45 }}>
              {hasDet
                ? cm.lezAvoided(violations.map((v) => v.name).join(', '), violations[0]?.vehicle_class, violations[0]?.min_euro_class)
                : cm.lezViolationNote(violations.map((v) => v.name).join(', '))}
            </span>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '6px 10px',
            background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 7,
          }}>
            <span style={{ fontSize: 13 }}>✅</span>
            <span style={{ fontSize: 11, color: '#444' }}>{cm.allZonesCompliant}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── RouteExplanationCard ────────────────────────────────────────────────────────
function RouteExplanationCard({ routeData, t, locale }) {
  const cm         = t.map;
  const violations = routeData.lez_violations ?? [];
  const avoided    = routeData.lez_avoidance_applied;
  const cost       = routeData.cost_breakdown;
  const vehicle    = routeData.vehicle;
  const sentences  = [];

  if (violations.length > 0) {
    const zones = violations.map((v) => v.name).join(', ');
    if (avoided) {
      sentences.push(cm.explanationLezAvoided(
        zones,
        violations[0].vehicle_class,
        Math.round(cost?.detour_km_extra ?? 0),
        Math.round(cost?.detour_min_extra ?? 0),
      ));
    } else {
      sentences.push(cm.explanationLezViolation(zones, violations[0].vehicle_class, violations[0].min_euro_class));
    }
  } else if (vehicle?.euro_klass != null) {
    sentences.push(cm.explanationCompliant(vehicle.euro_klass));
  }

  const cZones = cost?.congestion_zones ?? [];
  if (cZones.length > 0) {
    sentences.push(cm.explanationCongestion(
      cZones.map((z) => z.name).join(', '),
      fmtKr(cost.trangselskatt_kr, locale),
    ));
  }

  const bridges = cost?.bridge_tolls ?? [];
  if (bridges.length > 0) {
    sentences.push(cm.explanationBridge(
      bridges.map((b) => b.name).join(', '),
      fmtKr(cost.infrastrukturavgift_kr, locale),
    ));
  }

  if (!sentences.length) return null;

  return (
    <div style={{
      background: SURF, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '10px 14px', fontFamily: FONT,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: DIM, marginBottom: 6,
      }}>
        {cm.whyRoute}
      </div>
      {sentences.map((s, i) => (
        <p key={i} style={{ margin: i > 0 ? '4px 0 0' : 0, fontSize: 11, color: '#444', lineHeight: 1.55 }}>
          {s}
        </p>
      ))}
    </div>
  );
}

// ── RouteComparisonCard ────────────────────────────────────────────────────────
function RouteComparisonCard({ comparison, t, locale }) {
  if (!comparison) return null;
  const cm = t.map.comparison;

  return (
    <div style={{
      background: SURF, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '10px 14px', fontFamily: FONT,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: DIM, marginBottom: 8,
      }}>
        {cm.heading}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{
          padding: '8px 10px',
          background: 'rgba(231,76,60,0.05)', border: '1px solid rgba(231,76,60,0.18)',
          borderRadius: 7,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: RED, marginBottom: 3 }}>{cm.directLabel}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontFeatureSettings: '"tnum"' }}>
            {Math.round(comparison.direct_km ?? 0)} km
          </div>
          <div style={{ fontSize: 10, color: RED, marginTop: 2 }}>
            {cm.directFine(fmtKr(comparison.direct_fine_kr, locale))}
          </div>
        </div>
        <div style={{
          padding: '8px 10px',
          background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.22)',
          borderRadius: 7,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: G_GREEN, marginBottom: 3 }}>{cm.compliantLabel}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, fontFeatureSettings: '"tnum"' }}>
            {Math.round(comparison.compliant_km ?? 0)} km
          </div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
            {cm.compliantExtra(Math.round(comparison.extra_km ?? 0), fmtKr(comparison.extra_fuel_kr, locale))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function RouteMap({ routeData, loading }) {
  const { t, lang }                 = useLanguage();
  const locale                      = lang === 'sv' ? 'sv-SE' : 'en-GB';
  const containerRef                = useRef(null);
  const mapRef                      = useRef(null);
  const [showDirect, setShowDirect] = useState(false);

  const hasLez       = routeData?.lez_violations?.length > 0;
  const hasCompliant = Boolean(routeData?.compliant_route);
  const canToggle    = hasLez && hasCompliant && routeData?.direct_route;

  useEffect(() => {
    if (!routeData) return;
    let destroyed = false;

    loadLeaflet().then((Lf) => {
      if (destroyed || !containerRef.current) return;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = Lf.map(containerRef.current, {
        zoomControl: false, scrollWheelZoom: false, attributionControl: false,
      });
      mapRef.current = map;

      Lf.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(map);
      Lf.control.attribution({ position: 'bottomright', prefix: '© OpenStreetMap © CARTO' }).addTo(map);
      Lf.control.zoom({ position: 'bottomright' }).addTo(map);

      const bounds = [];

      // LEZ zone polygons — soft red semi-transparent fill
      for (const zone of (routeData.lez_zone_polygons ?? [])) {
        const latLngs = zone.polygon.map(([lon, lat]) => [lat, lon]);
        Lf.polygon(latLngs, {
          color: RED, weight: 1.5, opacity: 0.6,
          fillColor: RED, fillOpacity: 0.10,
        }).addTo(map).bindPopup(
          `<b style="color:${RED}">${zone.name}</b>`,
          { maxWidth: 200 },
        );
        latLngs.forEach((ll) => bounds.push(ll));
      }

      // Congestion zone polygons — soft amber semi-transparent fill with label
      for (const zone of (routeData.congestion_zone_polygons ?? [])) {
        const latLngs = zone.polygon.map(([lon, lat]) => [lat, lon]);
        Lf.polygon(latLngs, {
          color: AMBER, weight: 1.5, opacity: 0.65,
          fillColor: '#f59e0b', fillOpacity: 0.08,
        }).addTo(map).bindPopup(
          `<b style="color:${AMBER}">${zone.name}</b>`,
          { maxWidth: 200 },
        );
      }

      // Non-compliant direct route — dashed red (only when toggle is on)
      const directPolyline = routeData.direct_route?.polyline;
      if (canToggle && showDirect && directPolyline?.length > 1) {
        Lf.polyline(directPolyline, {
          color: RED, weight: 3, opacity: 0.65, dashArray: '8 6',
        }).addTo(map).bindPopup(
          `<span style="color:${RED};font-weight:600">${t.map.directRouteLabel}</span>`,
          { maxWidth: 200 },
        );
      }

      // Primary (compliant) route — white stroke + coloured line with draw animation
      const primaryPolyline = routeData.polyline;
      if (primaryPolyline?.length > 1) {
        Lf.polyline(primaryPolyline, {
          color: '#fff', weight: 8, opacity: 1,
          lineCap: 'round', lineJoin: 'round', smoothFactor: 1.5,
        }).addTo(map);
        const colorLine = Lf.polyline(primaryPolyline, {
          color: hasLez ? '#22c55e' : ACCENT,
          weight: 4, opacity: 0.85,
          lineCap: 'round', lineJoin: 'round', smoothFactor: 1.5,
        }).addTo(map);
        requestAnimationFrame(() => {
          const path = colorLine._path;
          if (path) {
            const len = path.getTotalLength();
            path.style.strokeDasharray = len;
            path.style.strokeDashoffset = len;
            path.animate(
              [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
              { duration: 1200, easing: 'cubic-bezier(0,0,0.2,1)', fill: 'forwards' },
            );
          }
        });
        primaryPolyline.forEach((ll) => bounds.push(ll));
      }

      // Markers — green pickup, accent delivery
      if (routeData.pickup_coords) {
        const [lat, lon] = routeData.pickup_coords;
        Lf.marker([lat, lon], { icon: pickupIcon(Lf) })
          .addTo(map).bindPopup(`<b>${t.map.pickup}</b>`, { maxWidth: 200 });
        bounds.push([lat, lon]);
      }
      if (routeData.delivery_coords) {
        const [lat, lon] = routeData.delivery_coords;
        Lf.marker([lat, lon], { icon: deliveryIcon(Lf) })
          .addTo(map).bindPopup(`<b>${t.map.delivery}</b>`, { maxWidth: 200 });
        bounds.push([lat, lon]);
      }

      // Disruption markers
      (routeData.disruptions ?? []).forEach((d) => {
        if (!d.coordinates) return;
        const [lat, lon] = d.coordinates;
        const delay = d.severity >= 4 ? 30 : d.severity >= 3 ? 15 : d.severity >= 2 ? 5 : 0;
        Lf.marker([lat, lon], { icon: disruptionIcon(Lf) })
          .addTo(map)
          .bindPopup(
            `<b>${d.description || d.location || t.map.alertTitle}</b>`
            + (d.location ? `<br><span style="color:#666">${d.location}</span>` : '')
            + (delay > 0   ? `<br><span style="color:#f59e0b">+${delay} min</span>` : ''),
            { maxWidth: 240 },
          );
        bounds.push([lat, lon]);
      });

      if (bounds.length > 0) {
        map.fitBounds(Lf.latLngBounds(bounds), { padding: [36, 48], maxZoom: 14 });
      }
      setTimeout(() => { if (!destroyed && mapRef.current) mapRef.current.invalidateSize(); }, 120);
    });

    return () => {
      destroyed = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [routeData, showDirect]); // eslint-disable-line react-hooks/exhaustive-deps

  function openInMaps() {
    if (!routeData) return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.platform)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    window.open(isIOS ? routeData.apple_maps_url : routeData.google_maps_url, '_blank', 'noopener');
  }

  const disruptions = routeData?.disruptions?.length ?? 0;
  const delayMin    = routeData?.delay_added_minutes ?? 0;

  if (loading && !routeData) {
    return (
      <div style={{ flexShrink: 0 }}>
        <div style={{
          height: 220, borderRadius: 8, border: '1px solid #e9ecef',
          background: 'linear-gradient(90deg,#f5f5f5 25%,#ebebeb 50%,#f5f5f5 75%)',
          backgroundSize: '200% 100%',
          animation: 'routeMapShimmer 1.4s infinite',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: FONT, fontSize: 12, color: '#bbb' }}>
            {t.map.loading}
          </span>
        </div>
        <style>{`@keyframes routeMapShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      </div>
    );
  }

  if (!routeData) return null;

  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* ── Map card ─────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #e9ecef', background: '#f5f5f5' }}>
        <div ref={containerRef} style={{ height: 220 }} />

        {/* Open in Maps pill */}
        <button
          onClick={openInMaps}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 1000,
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 100, padding: '5px 12px', fontSize: 11, fontWeight: 600,
            fontFamily: FONT, color: ACCENT, cursor: 'pointer',
            boxShadow: '0 1px 6px rgba(0,0,0,0.12)', whiteSpace: 'nowrap',
          }}
        >
          {t.map.openInMaps}
        </button>

        {/* Toggle direct/non-compliant route */}
        {canToggle && (
          <button
            onClick={() => setShowDirect((v) => !v)}
            style={{
              position: 'absolute', bottom: 8, left: 8, zIndex: 1000,
              background: showDirect ? 'rgba(231,76,60,0.9)' : 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              border: `1px solid ${showDirect ? 'rgba(231,76,60,0.4)' : 'rgba(0,0,0,0.08)'}`,
              borderRadius: 100, padding: '5px 12px', fontSize: 10, fontWeight: 600,
              fontFamily: FONT, color: showDirect ? '#fff' : RED, cursor: 'pointer',
              boxShadow: '0 1px 6px rgba(0,0,0,0.12)', whiteSpace: 'nowrap',
            }}
          >
            {showDirect ? t.map.hideDirectRoute : t.map.showDirectRoute}
          </button>
        )}
      </div>

      {/* ── Disruption banner ────────────────────────────────────────────────── */}
      {disruptions > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8, padding: '7px 12px', fontFamily: FONT, fontSize: 11,
        }}>
          <span style={{ color: '#92400e', lineHeight: 1.4 }}>
            {t.map.trafficDisruption(delayMin)}
          </span>
        </div>
      )}

      {/* ── Cost breakdown ───────────────────────────────────────────────────── */}
      <CostPanel
        cost={routeData.cost_breakdown}
        violations={routeData.lez_violations}
        t={t}
        locale={locale}
      />

      {/* ── Why this route explanation ───────────────────────────────────────── */}
      <RouteExplanationCard routeData={routeData} t={t} locale={locale} />

      {/* ── Route trade-off comparison (only when detour applies) ────────────── */}
      <RouteComparisonCard comparison={routeData.route_comparison} t={t} locale={locale} />

      <style>{`@keyframes routeMapShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}
