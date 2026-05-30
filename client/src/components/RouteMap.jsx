import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import 'leaflet/dist/leaflet.css';

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
      <div style="position:relative;width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#4361ee;border:3px solid #fff;box-shadow:0 3px 12px rgba(67,97,238,0.45)">
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

const fmtKr = (n) => n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

// ── Cost breakdown panel ──────────────────────────────────────────────────────

function CostPanel({ cost, violations, t }) {
  if (!cost) return null;
  const cm = t.map.cost;
  const hasLez      = violations?.length > 0;
  const hasDetour   = cost.detour_km_extra > 0;
  const hasCong     = cost.trangselskatt_kr > 0;
  const hasBridge   = cost.infrastrukturavgift_kr > 0;
  const hasFine     = cost.lez_bot_risk_kr > 0;

  const rows = [
    { label: cm.fuel,   value: fmtKr(cost.bransle_kr),             show: true },
    { label: cm.congestion, value: fmtKr(cost.trangselskatt_kr),   show: hasCong },
    { label: cm.bridge, value: fmtKr(cost.infrastrukturavgift_kr), show: hasBridge },
    {
      label: cm.lezFine,
      value: fmtKr(cost.lez_bot_risk_kr),
      show: hasFine,
      accent: '#e74c3c',
      sub: cm.lezFineNote,
    },
    {
      label: hasCong || hasBridge
        ? cm.detourExtraFull(cost.detour_km_extra, cost.detour_min_extra)
        : cm.detourExtra,
      value: '+' + fmtKr(cost.detour_merkostnad_kr),
      show: hasDetour,
      accent: '#d97706',
    },
  ].filter((r) => r.show);

  return (
    <div style={{
      background:   '#fafaf8',
      border:       '1px solid #e6e2da',
      borderTop:    'none',
      borderRadius: '0 0 8px 8px',
      padding:      '10px 14px 10px',
      fontFamily:   "'Geist', system-ui, sans-serif",
    }}>
      {/* Compliance status */}
      {hasLez ? (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 7,
          marginBottom: 8, padding: '7px 10px',
          background: hasDetour ? 'rgba(34,197,94,0.06)' : 'rgba(231,76,60,0.06)',
          border: `1px solid ${hasDetour ? 'rgba(34,197,94,0.2)' : 'rgba(231,76,60,0.2)'}`,
          borderRadius: 7,
        }}>
          <span style={{ fontSize: 13, marginTop: 1 }}>{hasDetour ? '✅' : '⚠️'}</span>
          <span style={{ fontSize: 11, color: '#444', lineHeight: 1.45 }}>
            {hasDetour
              ? cm.lezAvoided(violations.map((v) => v.name).join(', '), violations[0]?.vehicle_class, violations[0]?.min_euro_class)
              : cm.lezViolationNote(violations.map((v) => v.name).join(', '))}
          </span>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8,
          padding: '6px 10px',
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 7,
        }}>
          <span style={{ fontSize: 13 }}>✅</span>
          <span style={{ fontSize: 11, color: '#444' }}>{cm.allZonesCompliant}</span>
        </div>
      )}

      {/* Cost rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, color: row.accent ?? '#6b6359' }}>
              {row.label}
              {row.sub && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>{row.sub}</span>}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: row.accent ?? '#1c1917', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
              {row.value}
            </span>
          </div>
        ))}

        <div style={{ borderTop: '1px solid #e6e2da', marginTop: 3, paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1c1917' }}>{cm.total}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
            {fmtKr(cost.total_kr)}
          </span>
        </div>

        <div style={{ fontSize: 10, color: '#a09590', marginTop: 1 }}>
          {cm.dieselNote(cost.diesel_price_kr_l?.toFixed(2))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function RouteMap({ routeData, loading }) {
  const { t }                           = useLanguage();
  const containerRef                    = useRef(null);
  const mapRef                          = useRef(null);
  const [showDirect, setShowDirect]     = useState(false);

  const hasLez        = routeData?.lez_violations?.length > 0;
  const hasCompliant  = Boolean(routeData?.compliant_route);
  const canToggle     = hasLez && hasCompliant && routeData?.direct_route;

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

      // ── LEZ zone polygons — red semi-transparent ─────────────────────────
      for (const zone of (routeData.lez_zone_polygons ?? [])) {
        const latLngs = zone.polygon.map(([lon, lat]) => [lat, lon]);
        Lf.polygon(latLngs, {
          color:       '#e74c3c',
          weight:      1.5,
          opacity:     0.7,
          fillColor:   '#e74c3c',
          fillOpacity: 0.12,
        }).addTo(map).bindPopup(
          `<b style="color:#e74c3c">${zone.name}</b>`,
          { maxWidth: 200 },
        );
        latLngs.forEach((ll) => bounds.push(ll));
      }

      // ── Congestion zone polygons — amber semi-transparent ────────────────
      for (const zone of (routeData.congestion_zone_polygons ?? [])) {
        const latLngs = zone.polygon.map(([lon, lat]) => [lat, lon]);
        Lf.polygon(latLngs, {
          color:       '#d97706',
          weight:      1.5,
          opacity:     0.7,
          fillColor:   '#f59e0b',
          fillOpacity: 0.10,
        }).addTo(map).bindPopup(
          `<b style="color:#d97706">${zone.name}</b>`,
          { maxWidth: 200 },
        );
      }

      // ── Non-compliant direct route — dashed red (shown on toggle) ────────
      const directPolyline = routeData.direct_route?.polyline;
      if (canToggle && showDirect && directPolyline?.length > 1) {
        Lf.polyline(directPolyline, {
          color:     '#e74c3c',
          weight:    3,
          opacity:   0.7,
          dashArray: '8 6',
        }).addTo(map).bindPopup(
          `<span style="color:#e74c3c;font-weight:600">${t.map.directRouteLabel}</span>`,
          { maxWidth: 200 },
        );
      }

      // ── Primary (compliant) route — solid cyan/blue ───────────────────────
      const primaryPolyline = routeData.polyline;
      if (primaryPolyline?.length > 1) {
        Lf.polyline(primaryPolyline, {
          color: '#fff', weight: 8, opacity: 1,
          lineCap: 'round', lineJoin: 'round', smoothFactor: 1.5,
        }).addTo(map);
        const colorLine = Lf.polyline(primaryPolyline, {
          color:       hasLez ? '#22c55e' : '#4361ee',
          weight:      4,
          opacity:     0.85,
          lineCap:     'round',
          lineJoin:    'round',
          smoothFactor: 1.5,
        }).addTo(map);
        // Stroke-dashoffset draw animation — ease-out over 1.2s
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

      // ── Markers ───────────────────────────────────────────────────────────
      if (routeData.pickup_coords) {
        const [lat, lon] = routeData.pickup_coords;
        Lf.marker([lat, lon], { icon: pickupIcon(Lf) })
          .addTo(map).bindPopup(`<b>${t.map?.pickup ?? 'Upphämtning'}</b>`, { maxWidth: 200 });
        bounds.push([lat, lon]);
      }
      if (routeData.delivery_coords) {
        const [lat, lon] = routeData.delivery_coords;
        Lf.marker([lat, lon], { icon: deliveryIcon(Lf) })
          .addTo(map).bindPopup(`<b>${t.map?.delivery ?? 'Leverans'}</b>`, { maxWidth: 200 });
        bounds.push([lat, lon]);
      }

      // ── Disruption markers ────────────────────────────────────────────────
      (routeData.disruptions ?? []).forEach((d) => {
        if (!d.coordinates) return;
        const [lat, lon] = d.coordinates;
        const delay = d.severity >= 4 ? 30 : d.severity >= 3 ? 15 : d.severity >= 2 ? 5 : 0;
        Lf.marker([lat, lon], { icon: disruptionIcon(Lf) })
          .addTo(map)
          .bindPopup(
            `<b>${d.description || d.location || t.map?.alertTitle || 'Störning'}</b>`
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
          <span style={{ fontFamily: "'Geist', system-ui, sans-serif", fontSize: 12, color: '#bbb' }}>
            {t.map?.loading ?? 'Laddar karta…'}
          </span>
        </div>
        <style>{`@keyframes routeMapShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      </div>
    );
  }

  if (!routeData) return null;

  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Map */}
      <div style={{ position: 'relative' }}>
        <div
          ref={containerRef}
          style={{ height: 220, borderRadius: canToggle ? '8px 8px 0 0' : 8, overflow: 'hidden', border: '1px solid #e9ecef', background: '#f5f5f5' }}
        />

        {/* Open in Maps pill */}
        <button
          onClick={openInMaps}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 1000,
            background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 100, padding: '5px 12px', fontSize: 11, fontWeight: 600,
            fontFamily: "'Geist', system-ui, sans-serif", color: '#4361ee', cursor: 'pointer',
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
              background: showDirect ? 'rgba(231,76,60,0.9)' : 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              border: `1px solid ${showDirect ? 'rgba(231,76,60,0.4)' : 'rgba(0,0,0,0.08)'}`,
              borderRadius: 100, padding: '5px 12px', fontSize: 10, fontWeight: 600,
              fontFamily: "'Geist', system-ui, sans-serif",
              color: showDirect ? '#fff' : '#e74c3c', cursor: 'pointer',
              boxShadow: '0 1px 6px rgba(0,0,0,0.12)', whiteSpace: 'nowrap',
            }}
          >
            {showDirect ? t.map.hideDirectRoute : t.map.showDirectRoute}
          </button>
        )}
      </div>

      {/* Disruption banner */}
      {disruptions > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          borderTop: 'none', borderRadius: routeData.cost_breakdown ? 0 : '0 0 8px 8px',
          padding: '7px 12px', fontFamily: "'Geist', system-ui, sans-serif", fontSize: 11,
        }}>
          <span style={{ color: '#92400e', lineHeight: 1.4 }}>
            {t.map.trafficDisruption(delayMin)}
          </span>
        </div>
      )}

      {/* Cost breakdown panel */}
      <CostPanel
        cost={routeData.cost_breakdown}
        violations={routeData.lez_violations}
        t={t}
      />

      <style>{`@keyframes routeMapShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}
