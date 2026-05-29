import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Fuel, Upload, AlertTriangle, CheckCircle, RefreshCw,
  CreditCard, Truck, TrendingUp, X, Plus, Edit3, Trash2,
  BarChart3, Activity, MapPin, ChevronDown, ChevronUp,
} from 'lucide-react';
import { apiFetch } from '../utils/apiFetch.js';

const INTER    = "'Geist', system-ui, sans-serif";
const MONO     = "'Geist Mono', monospace";
const BG_BASE  = '#f4f5f7';
const SURF     = '#ffffff';
const ACCENT   = '#2d3340';
const ACCENT_SF = '#eef0f3';
const BORDER   = '#e4e6ea';
const TEXT_PR  = '#1a1d24';
const TEXT_SEC = '#4b5563';
const TEXT_MUT = '#6b7280';
const SHADOW   = '0 1px 4px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06)';
const D_GREEN  = '#16a34a';
const D_AMBER  = '#d97706';
const D_RED    = '#dc2626';
const D_BLUE   = '#2563eb';

const PROVIDERS = [
  { value: 'circle_k', label: 'Circle K' },
  { value: 'preem',    label: 'Preem' },
  { value: 'okq8',     label: 'OKQ8' },
  { value: 'tanka',    label: 'Tanka' },
  { value: 'unknown',  label: 'Okänd / annan' },
];

function providerLabel(p) {
  return PROVIDERS.find((x) => x.value === p)?.label ?? p ?? '—';
}

function fmt(n, suffix = ' kr') {
  if (n == null) return '—';
  return Math.round(n).toLocaleString('sv-SE') + suffix;
}

function fmtL(n) {
  if (n == null) return '—';
  return (Math.round(n * 10) / 10).toLocaleString('sv-SE') + ' L';
}

function fmtLpKm(n) {
  if (n == null) return '—';
  return (Math.round(n * 1000) / 1000).toFixed(3) + ' l/km';
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color = ACCENT }) {
  return (
    <div style={{
      background: SURF, borderRadius: 14, border: `1px solid ${BORDER}`,
      boxShadow: SHADOW, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12, background: ACCENT_SF, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontFamily: INTER, fontSize: 22, fontWeight: 800, color: TEXT_PR,
          fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MUT, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_SEC, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Card Mapping Modal ────────────────────────────────────────────────────────

function CardModal({ card, fleet, onClose, onSave }) {
  const [form, setForm] = useState({
    card_number:  card?.card_number  ?? '',
    vehicle_id:   card?.vehicle_id   ?? '',
    provider:     card?.provider     ?? '',
    holder_name:  card?.holder_name  ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.card_number.trim()) { setErr('Kortnummer krävs'); return; }
    setSaving(true); setErr('');
    try {
      const method = card ? 'PUT' : 'POST';
      const url    = card ? `/api/drivmedel/cards/${card.id}` : '/api/drivmedel/cards';
      const body   = { ...form, vehicle_id: form.vehicle_id ? parseInt(form.vehicle_id, 10) : null };
      const r = await apiFetch(url, { method, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onSave();
    } catch (ex) { setErr(ex.message); } finally { setSaving(false); }
  }

  const lbl = (text) => (
    <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
      color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
      {text}
    </label>
  );
  const inp = (style) => ({
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, color: TEXT_PR,
    background: BG_BASE, outline: 'none', ...style,
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: SURF, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 440, padding: '28px 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontFamily: INTER, fontSize: 17, fontWeight: 800, color: TEXT_PR, margin: 0 }}>
            {card ? 'Redigera kortkoppling' : 'Koppla drivmedelskort'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            {lbl('Kortnummer *')}
            <input value={form.card_number} onChange={set('card_number')} placeholder="1234 5678 9012 3456"
              disabled={!!card} style={inp()} />
          </div>
          <div style={{ marginBottom: 14 }}>
            {lbl('Fordon')}
            <select value={form.vehicle_id} onChange={set('vehicle_id')} style={inp()}>
              <option value="">— Ej kopplat —</option>
              {fleet.map((v) => (
                <option key={v.id} value={v.id}>{v.ext_id} — {v.namn} ({v.reg ?? '?'})</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              {lbl('Kortleverantör')}
              <select value={form.provider} onChange={set('provider')} style={inp()}>
                <option value="">—</option>
                {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              {lbl('Kortinnehavare')}
              <input value={form.holder_name} onChange={set('holder_name')} placeholder="Förare / Fordon"
                style={inp()} />
            </div>
          </div>
          {err && <p style={{ color: D_RED, fontSize: 12, fontFamily: INTER, marginBottom: 10 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 8, border: `1px solid ${BORDER}`,
              background: 'none', fontFamily: INTER, fontSize: 13, cursor: 'pointer', color: TEXT_SEC,
            }}>Avbryt</button>
            <button type="submit" disabled={saving} style={{
              padding: '9px 20px', borderRadius: 8, border: 'none',
              background: ACCENT, color: '#fff', fontFamily: INTER, fontSize: 13, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Sparar…' : 'Spara'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Import tab ────────────────────────────────────────────────────────────────

function ImportTab({ onImported }) {
  const fileRef      = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile]         = useState(null);
  const [result, setResult]     = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const [imports, setImports]     = useState([]);
  const [cards, setCards]         = useState([]);
  const [fleet, setFleet]         = useState([]);
  const [showCardModal, setShowCardModal] = useState(false);
  const [editCard, setEditCard]           = useState(null);

  const loadCards = useCallback(() => {
    apiFetch('/api/drivmedel/cards').then((r) => r.ok ? r.json() : []).then(setCards);
    apiFetch('/api/fleet').then((r) => r.ok ? r.json() : {}).then((d) => setFleet(d.fleet ?? d ?? []));
    apiFetch('/api/drivmedel/imports').then((r) => r.ok ? r.json() : []).then(setImports);
  }, []);

  useEffect(() => { loadCards(); }, [loadCards]);

  function handleFile(f) {
    if (!f) return;
    setFile(f); setResult(null); setError('');
  }

  async function doImport() {
    if (!file) return;
    setUploading(true); setError(''); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('auth_token');
      const r = await fetch('/api/drivmedel/import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await r.json();
      if (!r.ok) { setError(json.error ?? `HTTP ${r.status}`); return; }
      setResult(json);
      setFile(null);
      loadCards();
      onImported();
    } catch (ex) {
      setError(ex.message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteCard(id) {
    if (!window.confirm('Ta bort kortkoppling?')) return;
    await apiFetch(`/api/drivmedel/cards/${id}`, { method: 'DELETE' });
    loadCards();
  }

  async function reconcile() {
    const r = await apiFetch('/api/drivmedel/reconcile', { method: 'POST' });
    const d = await r.json();
    alert(`Avstämning klar: ${d.reconciled} transaktioner kopplade till jobb.`);
    onImported();
  }

  return (
    <div>
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? ACCENT : BORDER}`,
          borderRadius: 14, padding: '40px 32px', textAlign: 'center',
          background: dragging ? ACCENT_SF : BG_BASE,
          cursor: 'pointer', marginBottom: 20, transition: '120ms',
        }}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xlsm"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])} />
        <Upload size={28} color={dragging ? ACCENT : TEXT_MUT} style={{ margin: '0 auto 10px' }} />
        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: TEXT_PR, marginBottom: 4 }}>
          {file ? file.name : 'Dra hit eller klicka för att välja fil'}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MUT }}>
          CSV eller Excel från Circle K, Preem, OKQ8 eller Tanka
        </div>
      </div>

      {file && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
          <div style={{ flex: 1, fontFamily: INTER, fontSize: 13, color: TEXT_PR }}>
            <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
          </div>
          <button onClick={() => setFile(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT,
          }}><X size={14} /></button>
          <button onClick={doImport} disabled={uploading} style={{
            padding: '9px 20px', borderRadius: 8, border: 'none',
            background: ACCENT, color: '#fff', fontFamily: INTER, fontSize: 13, fontWeight: 700,
            cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1,
          }}>
            {uploading ? 'Importerar…' : 'Importera'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: D_RED + '12', border: `1px solid ${D_RED}40`, borderRadius: 10,
          padding: '12px 16px', fontFamily: INTER, fontSize: 13, color: D_RED, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ background: D_GREEN + '10', border: `1px solid ${D_GREEN}40`, borderRadius: 10,
          padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: D_GREEN, marginBottom: 10 }}>
            Import klar — {providerLabel(result.provider)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              ['Inlästa rader', result.parsed],
              ['Sparade', result.saved],
              ['Fordon matchade', result.matched],
              ['Ej matchade', result.unmatched],
            ].map(([k, v]) => (
              <div key={k} style={{ background: SURF, borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                <div style={{ fontFamily: INTER, fontSize: 18, fontWeight: 800, color: TEXT_PR }}>{v}</div>
              </div>
            ))}
          </div>
          {result.unmatched > 0 && (
            <p style={{ fontFamily: INTER, fontSize: 12, color: D_AMBER, margin: '10px 0 0' }}>
              {result.unmatched} transaktion{result.unmatched !== 1 ? 'er' : ''} kunde inte kopplas till ett fordon.
              Lägg till kortnummer nedan.
            </p>
          )}
        </div>
      )}

      {/* Reconcile button */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24 }}>
        <button onClick={reconcile} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 18px', borderRadius: 8, border: `1px solid ${BORDER}`,
          background: SURF, fontFamily: INTER, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', color: TEXT_SEC,
        }}>
          <RefreshCw size={13} />
          Kör jobbavstämning
        </button>
        <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT }}>
          Matchar transaktioner mot jobb som kördes samma dag
        </span>
      </div>

      {/* Card mappings */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontFamily: INTER, fontSize: 14, fontWeight: 800, color: TEXT_PR, margin: 0 }}>
            Kortkopplingar
          </h3>
          <button onClick={() => { setEditCard(null); setShowCardModal(true); }} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: ACCENT, color: '#fff', fontFamily: INTER, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            <Plus size={12} /> Koppla kort
          </button>
        </div>

        {cards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: TEXT_MUT, fontFamily: INTER, fontSize: 13,
            background: BG_BASE, borderRadius: 10, border: `1px dashed ${BORDER}` }}>
            Inga kort kopplade. Kortinfo används för att automatiskt matcha transaktioner till rätt fordon.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cards.map((c) => (
              <div key={c.id} style={{
                background: SURF, borderRadius: 10, border: `1px solid ${BORDER}`,
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <CreditCard size={14} color={TEXT_MUT} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: TEXT_PR,
                    fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                    {c.card_number}
                  </div>
                  <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT }}>
                    {providerLabel(c.provider)}
                    {c.holder_name ? ` · ${c.holder_name}` : ''}
                  </div>
                </div>
                {c.vehicle_namn ? (
                  <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_SEC,
                    background: ACCENT_SF, borderRadius: 6, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Truck size={11} />{c.vehicle_ext_id} {c.vehicle_namn}
                  </div>
                ) : (
                  <span style={{ fontFamily: INTER, fontSize: 11, color: D_AMBER,
                    background: D_AMBER + '15', borderRadius: 6, padding: '3px 8px' }}>
                    Ej kopplat
                  </span>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setEditCard(c); setShowCardModal(true); }} style={{
                    background: ACCENT_SF, border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: TEXT_SEC,
                  }}><Edit3 size={11} /></button>
                  <button onClick={() => deleteCard(c.id)} style={{
                    background: D_RED + '12', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: D_RED,
                  }}><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import history */}
      {imports.length > 0 && (
        <div>
          <h3 style={{ fontFamily: INTER, fontSize: 14, fontWeight: 800, color: TEXT_PR, marginBottom: 10 }}>
            Importhistorik
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {imports.slice(0, 10).map((imp) => (
              <div key={imp.id} style={{
                background: SURF, borderRadius: 8, border: `1px solid ${BORDER}`,
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1, fontFamily: INTER, fontSize: 12, color: TEXT_PR }}>
                  {imp.filename}
                </div>
                <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT }}>
                  {providerLabel(imp.provider)}
                </span>
                <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_SEC }}>
                  {imp.row_count} rader · {imp.matched_count} matchade
                </span>
                <span style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT }}>
                  {imp.imported_at?.slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCardModal && (
        <CardModal
          card={editCard}
          fleet={fleet}
          onClose={() => { setShowCardModal(false); setEditCard(null); }}
          onSave={() => { setShowCardModal(false); setEditCard(null); loadCards(); }}
        />
      )}
    </div>
  );
}

// ── Vehicle analytics tab ─────────────────────────────────────────────────────

function FordonTab({ analytics, loading, onRefresh }) {
  const [expanded, setExpanded] = useState(null);

  if (loading) return <p style={{ fontFamily: INTER, color: TEXT_MUT, textAlign: 'center', padding: 40 }}>Hämtar…</p>;
  if (!analytics) return null;

  const { vehicles, fleet_avg_l_per_km, monthly_trend, top_stations, unmapped_cards } = analytics;

  return (
    <div>
      {/* Fleet average */}
      {fleet_avg_l_per_km && (
        <div style={{
          background: SURF, borderRadius: 12, border: `1px solid ${BORDER}`,
          padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Activity size={16} color={D_BLUE} />
          <span style={{ fontFamily: INTER, fontSize: 13, color: TEXT_PR }}>
            Flottnomsnitt: <strong>{fmtLpKm(fleet_avg_l_per_km)}</strong>
          </span>
          <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT, marginLeft: 'auto' }}>
            Baserat på {vehicles.length} fordon med drivmedelsdata
          </span>
        </div>
      )}

      {/* Unmapped card warning */}
      {unmapped_cards?.length > 0 && (
        <div style={{
          background: D_AMBER + '12', border: `1px solid ${D_AMBER}40`,
          borderRadius: 12, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <AlertTriangle size={16} color={D_AMBER} style={{ marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: D_AMBER, marginBottom: 4 }}>
              {unmapped_cards.length} okopplade kort — {fmt(unmapped_cards.reduce((s, c) => s + c.total_sek, 0))} ej tillskrivet fordon
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {unmapped_cards.map((c) => (
                <span key={c.card_number} style={{
                  background: SURF, borderRadius: 6, padding: '2px 8px',
                  fontFamily: INTER, fontSize: 11, color: TEXT_SEC,
                  border: `1px solid ${BORDER}`,
                }}>
                  {c.card_number} · {fmt(c.total_sek)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Per-vehicle cards */}
      {vehicles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: TEXT_MUT, fontFamily: INTER }}>
          <Fuel size={36} color={TEXT_MUT} style={{ marginBottom: 12 }} />
          <p style={{ fontWeight: 700, color: TEXT_PR, margin: '0 0 6px' }}>Ingen drivmedelsdata ännu</p>
          <p style={{ fontSize: 13 }}>Importera en CSV-fil från din kortleverantör för att se statistik.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 28 }}>
          {vehicles.map((v) => (
            <div key={v.id} style={{
              background: SURF, borderRadius: 14, boxShadow: SHADOW,
              border: `1.5px solid ${v.anomaly ? D_RED + '60' : BORDER}`,
            }}>
              <div
                style={{ padding: '16px 18px', cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === v.id ? null : v.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 800, color: TEXT_PR }}>
                      {v.ext_id} — {v.namn}
                    </div>
                    {v.reg && <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT, marginTop: 1 }}>{v.reg}</div>}
                  </div>
                  {v.anomaly && (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: D_RED + '15', color: D_RED, borderRadius: 8,
                      padding: '3px 8px', fontFamily: INTER, fontSize: 11, fontWeight: 700,
                    }}>
                      <AlertTriangle size={10} />
                      +{v.anomaly_pct}% vs snitt
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    ['Totalt', fmt(v.total_sek)],
                    ['Liter', fmtL(v.total_litres)],
                    ['l/km', fmtLpKm(v.l_per_km)],
                  ].map(([k, val]) => (
                    <div key={k} style={{ background: BG_BASE, borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontFamily: INTER, fontSize: 9, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k}</div>
                      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800, color: TEXT_PR, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {expanded === v.id && (
                <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 18px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      ['Transaktioner', v.tx_count],
                      ['Kopplade till jobb', v.reconciled_count],
                      ['Km (reconciled)', v.total_km > 0 ? Math.round(v.total_km).toLocaleString('sv-SE') + ' km' : '—'],
                      ['Förväntad förbrukning', v.expected_l_per_km ? fmtLpKm(v.expected_l_per_km) : '—'],
                    ].map(([k, val]) => (
                      <div key={k}>
                        <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                        <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: TEXT_PR }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {v.anomaly && (
                    <div style={{
                      marginTop: 10, fontFamily: INTER, fontSize: 12, color: D_RED,
                      background: D_RED + '10', borderRadius: 8, padding: '8px 10px',
                    }}>
                      <strong>Avvikelse:</strong> {fmtLpKm(v.l_per_km)} vs flottsnitt {fmtLpKm(fleet_avg_l_per_km)}.
                      Kan indikera servicebehov eller drivmedelsstöld.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Monthly trend */}
      {monthly_trend?.length > 1 && (
        <div style={{ background: SURF, borderRadius: 14, boxShadow: SHADOW, border: `1px solid ${BORDER}`, padding: '20px 24px', marginBottom: 20 }}>
          <h3 style={{ fontFamily: INTER, fontSize: 14, fontWeight: 800, color: TEXT_PR, margin: '0 0 16px' }}>
            Månatlig kostnad
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
            {monthly_trend.map((m) => {
              const maxAmt = Math.max(...monthly_trend.map((x) => x.amount_sek));
              const h = maxAmt > 0 ? Math.max(4, Math.round(m.amount_sek / maxAmt * 72)) : 4;
              return (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 9, fontFamily: MONO, color: TEXT_MUT, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                    {m.amount_sek >= 1000 ? Math.round(m.amount_sek / 1000) + 'k' : Math.round(m.amount_sek)}
                  </div>
                  <div style={{ width: '100%', height: h, borderRadius: 4, background: D_BLUE + '80' }} />
                  <div style={{ fontSize: 9, fontFamily: INTER, color: TEXT_MUT }}>{m.month.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top stations */}
      {top_stations?.length > 0 && (
        <div style={{ background: SURF, borderRadius: 14, boxShadow: SHADOW, border: `1px solid ${BORDER}`, padding: '20px 24px' }}>
          <h3 style={{ fontFamily: INTER, fontSize: 14, fontWeight: 800, color: TEXT_PR, margin: '0 0 12px' }}>
            Topp tankmackar
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top_stations.map((s, i) => (
              <div key={s.station_name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                background: i === 0 ? ACCENT_SF : 'transparent',
              }}>
                <MapPin size={12} color={TEXT_MUT} />
                <span style={{ flex: 1, fontFamily: INTER, fontSize: 12, color: TEXT_PR }}>{s.station_name}</span>
                <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT }}>{s.tx_count} tank</span>
                <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: TEXT_PR,
                  fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{fmt(s.total_sek)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Transactions tab ──────────────────────────────────────────────────────────

function TransaktionerTab({ fleet }) {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterFrom, setFilterFrom]       = useState('');
  const [filterTo, setFilterTo]           = useState('');
  const [unreconciled, setUnreconciled]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filterVehicle)  p.set('vehicle_id', filterVehicle);
    if (filterFrom)     p.set('from', filterFrom);
    if (filterTo)       p.set('to', filterTo);
    if (unreconciled)   p.set('unreconciled', '1');
    apiFetch(`/api/drivmedel/transactions?${p}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filterVehicle, filterFrom, filterTo, unreconciled]);

  useEffect(() => { load(); }, [load]);

  const sel = {
    padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
    fontFamily: INTER, fontSize: 12, background: SURF, color: TEXT_SEC, outline: 'none',
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)} style={sel}>
          <option value="">Alla fordon</option>
          {fleet.map((v) => <option key={v.id} value={v.id}>{v.ext_id} — {v.namn}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
          style={{ ...sel, color: filterFrom ? TEXT_PR : TEXT_MUT }} />
        <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
          style={{ ...sel, color: filterTo ? TEXT_PR : TEXT_MUT }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: INTER, fontSize: 12,
          color: TEXT_SEC, cursor: 'pointer' }}>
          <input type="checkbox" checked={unreconciled} onChange={(e) => setUnreconciled(e.target.checked)}
            style={{ accentColor: ACCENT }} />
          Visa ej avstämda
        </label>
      </div>

      {loading && <p style={{ fontFamily: INTER, color: TEXT_MUT, textAlign: 'center', padding: 40 }}>Hämtar…</p>}

      {!loading && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: TEXT_MUT, fontFamily: INTER }}>
          Inga transaktioner matchar filtret.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: INTER, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                {['Datum', 'Fordon', 'Mack', 'Bränsle', 'Liter', 'Belopp', 'kr/L', 'Jobb'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700,
                    color: TEXT_MUT, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '8px 12px', color: TEXT_PR, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                    {r.transaction_date}
                  </td>
                  <td style={{ padding: '8px 12px', color: r.vehicle_id ? TEXT_PR : D_AMBER }}>
                    {r.vehicle_ext_id ? `${r.vehicle_ext_id} ${r.vehicle_reg ?? ''}` : r.card_number ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: TEXT_SEC, maxWidth: 160, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.station_name ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: TEXT_SEC }}>{r.fuel_type ?? '—'}</td>
                  <td style={{ padding: '8px 12px', color: TEXT_PR, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {r.litres != null ? (Math.round(r.litres * 10) / 10).toLocaleString('sv-SE') : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: TEXT_PR, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 700 }}>
                    {r.amount_sek != null ? Math.round(r.amount_sek).toLocaleString('sv-SE') + ' kr' : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: TEXT_MUT, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {r.price_per_litre != null ? (Math.round(r.price_per_litre * 100) / 100).toFixed(2) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {r.job_id ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: D_GREEN, fontSize: 11, fontWeight: 700 }}>
                        <CheckCircle size={11} /> #{r.job_id}
                      </span>
                    ) : (
                      <span style={{ color: TEXT_MUT, fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Drivmedel() {
  const [tab, setTab]             = useState('fordon');
  const [stats, setStats]         = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [fleet, setFleet]         = useState([]);
  const [dateFrom, setDateFrom]   = useState(
    new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
  );
  const [dateTo, setDateTo]       = useState(new Date().toISOString().slice(0, 10));

  const loadAnalytics = useCallback(() => {
    setAnalyticsLoading(true);
    apiFetch(`/api/drivmedel/analytics?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setAnalytics)
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, [dateFrom, dateTo]);

  const loadStats = useCallback(() => {
    apiFetch('/api/drivmedel/stats')
      .then((r) => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {});
    apiFetch('/api/fleet')
      .then((r) => r.ok ? r.json() : {})
      .then((d) => setFleet(d.fleet ?? d ?? []));
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  return (
    <div style={{ padding: '28px 32px', fontFamily: INTER }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: INTER, fontSize: 22, fontWeight: 900, color: TEXT_PR, margin: 0, letterSpacing: '-0.02em' }}>
            Drivmedelskort
          </h1>
          <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT, margin: '4px 0 0' }}>
            Verkliga bränslekostnader per fordon — importera kortutdrag, stäm av mot jobb.
          </p>
        </div>
        {/* Date range for analytics */}
        {tab === 'fordon' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 12, background: SURF, outline: 'none' }} />
            <span style={{ color: TEXT_MUT, fontSize: 12, fontFamily: INTER }}>—</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 12, background: SURF, outline: 'none' }} />
          </div>
        )}
      </div>

      {/* KPI row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          <KpiCard label="Kostnad denna månad" value={fmt(stats.this_month_sek)}
            icon={Fuel} color={D_AMBER} sub={`${stats.tx_count} transaktioner`} />
          <KpiCard label="Registrerade kort" value={stats.registered_cards}
            icon={CreditCard} />
          <KpiCard label="Ej avstämda" value={stats.unreconciled}
            icon={RefreshCw} color={stats.unreconciled > 0 ? D_AMBER : D_GREEN}
            sub={`${stats.reconciled} kopplade till jobb`} />
          <KpiCard label="Fordon med avvikelse" value={stats.anomaly_vehicles}
            icon={AlertTriangle} color={stats.anomaly_vehicles > 0 ? D_RED : D_GREEN}
            sub="hög förbrukning vs flott" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
        {[['fordon', 'Fordon & analys'], ['transaktioner', 'Transaktioner'], ['import', 'Import & kort']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none',
            background: tab === id ? SURF : 'transparent',
            borderBottom: tab === id ? `2px solid ${ACCENT}` : '2px solid transparent',
            fontFamily: INTER, fontSize: 13, fontWeight: tab === id ? 700 : 500,
            color: tab === id ? TEXT_PR : TEXT_MUT, cursor: 'pointer',
          }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'fordon'       && <FordonTab analytics={analytics} loading={analyticsLoading} onRefresh={loadAnalytics} />}
      {tab === 'transaktioner' && <TransaktionerTab fleet={fleet} />}
      {tab === 'import'       && <ImportTab onImported={() => { loadStats(); loadAnalytics(); }} />}
    </div>
  );
}
