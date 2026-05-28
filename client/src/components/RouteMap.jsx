import { useEffect, useRef } from 'react';
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
      .leaflet-popup-content-wrapper{border-radius:10px!important;box-shadow:0 4px 20px rgba(0,0,0,0.15)!important;padding:0!important;font-family:'Inter',sans-serif!important;}
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

// ── Marker icons ──────────────────────────────────────────────────────────────

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
    iconSize:   [36, 44],
    iconAnchor: [18, 44],
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
    iconSize:   [36, 44],
    iconAnchor: [18, 44],
  });
}

function disruptionIcon(Lf) {
  return Lf.divIcon({
    className: '',
    html: `<div style="position:relative;width:28px;height:24px">
      <div style="width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:24px solid #f59e0b;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25))"></div>
      <span style="position:absolute;top:9px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:800;color:#fff;font-family:'Inter',sans-serif;line-height:1">!</span>
    </div>`,
    iconSize:   [28, 24],
    iconAnchor: [14, 24],
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RouteMap({ routeData, loading }) {
  const { t } = useLanguage();
  const containerRef = useRef(null);
  const mapRef       = useRef(null);

  // Build and tear down map whenever routeData changes
  useEffect(() => {
    if (!routeData) return;
    let destroyed = false;

    loadLeaflet().then((Lf) => {
      if (destroyed || !containerRef.current) return;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = Lf.map(containerRef.current, {
        zoomControl:        false,
        scrollWheelZoom:    false,
        attributionControl: false,
      });
      mapRef.current = map;

      // CartoDB Positron — Apple Maps-like clean tiles
      Lf.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom:    19,
      }).addTo(map);

      Lf.control.attribution({ position: 'bottomright', prefix: '© OpenStreetMap © CARTO' }).addTo(map);
      Lf.control.zoom({ position: 'bottomright' }).addTo(map);

      const bounds = [];

      // Route polyline — #4361ee, weight 4, opacity 0.8
      if (routeData.polyline?.length > 1) {
        Lf.polyline(routeData.polyline, {
          color:       '#ffffff',
          weight:      8,
          opacity:     1,
          lineCap:     'round',
          lineJoin:    'round',
          smoothFactor: 1.5,
        }).addTo(map);
        Lf.polyline(routeData.polyline, {
          color:       '#4361ee',
          weight:      4,
          opacity:     0.8,
          lineCap:     'round',
          lineJoin:    'round',
          smoothFactor: 1.5,
        }).addTo(map);
        routeData.polyline.forEach((ll) => bounds.push(ll));
      }

      // Pickup marker
      if (routeData.pickup_coords) {
        const [lat, lon] = routeData.pickup_coords;
        Lf.marker([lat, lon], { icon: pickupIcon(Lf) })
          .addTo(map)
          .bindPopup(
            `<b>${t.map?.pickup ?? 'Upphämtning'}</b>`,
            { maxWidth: 200 },
          );
        bounds.push([lat, lon]);
      }

      // Delivery marker
      if (routeData.delivery_coords) {
        const [lat, lon] = routeData.delivery_coords;
        Lf.marker([lat, lon], { icon: deliveryIcon(Lf) })
          .addTo(map)
          .bindPopup(
            `<b>${t.map?.delivery ?? 'Leverans'}</b>`,
            { maxWidth: 200 },
          );
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
  }, [routeData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect iOS for maps URL
  function openInMaps() {
    if (!routeData) return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.platform)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    window.open(isIOS ? routeData.apple_maps_url : routeData.google_maps_url, '_blank', 'noopener');
  }

  const disruptions    = routeData?.disruptions?.length ?? 0;
  const delayMin       = routeData?.delay_added_minutes ?? 0;

  // Skeleton while loading
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
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: '#bbb' }}>
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
          style={{
            height:       220,
            borderRadius: 8,
            overflow:     'hidden',
            border:       '1px solid #e9ecef',
            background:   '#f5f5f5',
          }}
        />

        {/* "Open in Maps" pill — top right */}
        <button
          onClick={openInMaps}
          style={{
            position:       'absolute',
            top:            8,
            right:          8,
            zIndex:         1000,
            background:     'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border:         '1px solid rgba(0,0,0,0.08)',
            borderRadius:   100,
            padding:        '5px 12px',
            fontSize:       11,
            fontWeight:     600,
            fontFamily:     "'Inter',sans-serif",
            color:          '#4361ee',
            cursor:         'pointer',
            boxShadow:      '0 1px 6px rgba(0,0,0,0.12)',
            whiteSpace:     'nowrap',
          }}
        >
          {t.map.openInMaps}
        </button>
      </div>

      {/* Disruption banner */}
      {disruptions > 0 && (
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          8,
          background:   'rgba(245,158,11,0.1)',
          border:       '1px solid rgba(245,158,11,0.3)',
          borderTop:    'none',
          borderRadius: '0 0 8px 8px',
          padding:      '7px 12px',
          fontFamily:   "'Inter',sans-serif",
          fontSize:     11,
        }}>
          <span style={{ color: '#92400e', lineHeight: 1.4 }}>
            {t.map.trafficDisruption(delayMin)}
          </span>
        </div>
      )}

      <style>{`@keyframes routeMapShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}
