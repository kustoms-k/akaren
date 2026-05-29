import { useState, useEffect, useCallback } from 'react';
import {
  Network, Plus, Trash2, Edit3, CheckCircle, XCircle, Clock,
  ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp, Phone,
  Mail, Building2, BarChart3, X, Send, FileText,
} from 'lucide-react';
import { apiFetch } from '../utils/apiFetch.js';

const INTER    = "'Plus Jakarta Sans', system-ui, sans-serif";
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

const STATUS_META = {
  föreslagen: { label: 'Föreslagen', color: D_AMBER,  Icon: Clock },
  accepterad: { label: 'Accepterad', color: D_BLUE,   Icon: CheckCircle },
  avvisad:    { label: 'Avvisad',    color: D_RED,    Icon: XCircle },
  utfört:     { label: 'Utfört',     color: D_GREEN,  Icon: CheckCircle },
};

function fmt(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('sv-SE') + ' kr';
  return v;
}

function KpiCard({ label, value, sub, icon: Icon, color = ACCENT }) {
  return (
    <div style={{
      background: SURF, borderRadius: 14, border: `1px solid ${BORDER}`,
      boxShadow: SHADOW, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12, background: ACCENT_SF,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontFamily: INTER, fontSize: 22, fontWeight: 800, color: TEXT_PR,
          fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MUT, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_SEC, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const m = STATUS_META[status] ?? { label: status, color: TEXT_MUT, Icon: Clock };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      background: m.color + '18', color: m.color,
      fontSize: 11, fontWeight: 700, fontFamily: INTER,
    }}>
      <m.Icon size={10} />
      {m.label}
    </span>
  );
}

// ── Add/Edit Partner Modal ────────────────────────────────────────────────────

function PartnerModal({ partner, onClose, onSave }) {
  const [form, setForm] = useState({
    partner_name:  partner?.partner_name  ?? '',
    org_nr:        partner?.org_nr        ?? '',
    contact_name:  partner?.contact_name  ?? '',
    contact_phone: partner?.contact_phone ?? '',
    contact_email: partner?.contact_email ?? '',
    notes:         partner?.notes         ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.partner_name.trim()) { setErr('Namn krävs'); return; }
    setSaving(true); setErr('');
    try {
      const method = partner ? 'PUT' : 'POST';
      const url    = partner ? `/api/natverk/partners/${partner.id}` : '/api/natverk/partners';
      const r = await apiFetch(url, { method, body: JSON.stringify(form) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onSave();
    } catch (ex) {
      setErr(ex.message ?? 'Fel vid sparning');
    } finally {
      setSaving(false);
    }
  }

  const field = (label, key, type = 'text', ph = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
        color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        type={type} value={form[key]} onChange={set(key)} placeholder={ph}
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
          border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, color: TEXT_PR,
          outline: 'none', background: BG_BASE }}
      />
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: SURF, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 480, padding: '28px 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontFamily: INTER, fontSize: 17, fontWeight: 800, color: TEXT_PR, margin: 0 }}>
            {partner ? 'Redigera partner' : 'Lägg till partner'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit}>
          {field('Företagsnamn *', 'partner_name', 'text', 'T.ex. Söderberg Transport AB')}
          {field('Org.nr', 'org_nr', 'text', '556XXX-XXXX')}
          {field('Kontaktperson', 'contact_name', 'text', 'Namn')}
          {field('Telefon', 'contact_phone', 'tel', '+46700000000')}
          {field('E-post', 'contact_email', 'email', 'kontakt@foretag.se')}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Noteringar
            </label>
            <textarea
              value={form.notes} onChange={set('notes')} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, color: TEXT_PR,
                resize: 'vertical', outline: 'none', background: BG_BASE }}
            />
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

// ── New Referral Modal ────────────────────────────────────────────────────────

function ReferralModal({ partners, onClose, onSave }) {
  const [form, setForm] = useState({
    partner_company_id:          '',
    riktning:                    'ut',
    lasttyp:                     '',
    upphämtning:                 '',
    leverans:                    '',
    datum:                       '',
    overenskommet_totalpris_sek: '',
    formedlingsavgift_pct:       '10',
    noteringar:                  '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const total = parseFloat(form.overenskommet_totalpris_sek) || 0;
  const pct   = parseFloat(form.formedlingsavgift_pct)       || 10;
  const avgift = total > 0 ? Math.round(total * pct / 100) : null;
  const partnerFår = total > 0 ? Math.round(total * (1 - pct / 100)) : null;

  async function submit(e) {
    e.preventDefault();
    if (!form.partner_company_id) { setErr('Välj partner'); return; }
    setSaving(true); setErr('');
    try {
      const body = {
        ...form,
        partner_company_id:          parseInt(form.partner_company_id, 10),
        overenskommet_totalpris_sek: total || null,
        formedlingsavgift_pct:       pct,
      };
      const r = await apiFetch('/api/natverk/referrals', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onSave();
    } catch (ex) {
      setErr(ex.message ?? 'Fel');
    } finally {
      setSaving(false);
    }
  }

  const inp = (label, key, type = 'text', ph = '') => (
    <div>
      <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
        color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input type={type} value={form[key]} onChange={set(key)} placeholder={ph}
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
          border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, color: TEXT_PR,
          outline: 'none', background: BG_BASE }} />
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: SURF, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 520, padding: '28px 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontFamily: INTER, fontSize: 17, fontWeight: 800, color: TEXT_PR, margin: 0 }}>
            Lägg ut på partner
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT }}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit}>
          {/* Partner */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Partner *
            </label>
            <select value={form.partner_company_id} onChange={set('partner_company_id')}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 13, color: TEXT_PR, background: BG_BASE, outline: 'none' }}>
              <option value="">— Välj partner —</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.partner_name}</option>)}
            </select>
          </div>

          {/* Direction */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Riktning
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['ut', 'Vi skickar ut'], ['in', 'Vi tar emot']].map(([val, lbl]) => (
                <label key={val} style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                  borderRadius: 8, border: `1.5px solid ${form.riktning === val ? ACCENT : BORDER}`,
                  cursor: 'pointer', fontFamily: INTER, fontSize: 13,
                  background: form.riktning === val ? ACCENT_SF : 'transparent',
                }}>
                  <input type="radio" name="riktning" value={val}
                    checked={form.riktning === val} onChange={set('riktning')}
                    style={{ accentColor: ACCENT }} />
                  {val === 'ut' ? <ArrowUpRight size={13} color={ACCENT} /> : <ArrowDownLeft size={13} color={D_BLUE} />}
                  {lbl}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {inp('Lasttyp', 'lasttyp', 'text', 'T.ex. Grävmaskin')}
            {inp('Datum', 'datum', 'date')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {inp('Upphämtning', 'upphämtning', 'text', 'Adress')}
            {inp('Leverans', 'leverans', 'text', 'Adress')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {inp('Överenskommet pris (kr)', 'overenskommet_totalpris_sek', 'number', '0')}
            {inp('Förmedlingsavgift (%)', 'formedlingsavgift_pct', 'number', '10')}
          </div>

          {/* Price preview */}
          {total > 0 && (
            <div style={{
              background: BG_BASE, borderRadius: 10, padding: '12px 16px', marginBottom: 14,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
            }}>
              <div>
                <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {form.riktning === 'ut' ? 'Vi behåller (avgift)' : 'Vi betalar (avgift)'}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 16, fontWeight: 800, color: form.riktning === 'ut' ? D_GREEN : D_AMBER,
                  fontVariantNumeric: 'tabular-nums' }}>
                  {avgift?.toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div>
                <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Partner {form.riktning === 'ut' ? 'får' : 'fakturerar'}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 16, fontWeight: 800, color: TEXT_PR,
                  fontVariantNumeric: 'tabular-nums' }}>
                  {partnerFår?.toLocaleString('sv-SE')} kr
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Noteringar
            </label>
            <textarea value={form.noteringar} onChange={set('noteringar')} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, color: TEXT_PR,
                resize: 'vertical', outline: 'none', background: BG_BASE }} />
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
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Send size={13} />
              {saving ? 'Skickar…' : 'Skicka'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Settlement Panel ──────────────────────────────────────────────────────────

function SettlementPanel({ partners, onClose }) {
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? '');
  const [month, setMonth]         = useState(new Date().toISOString().slice(0, 7));
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!partnerId) return;
    setLoading(true);
    apiFetch(`/api/natverk/settlement/${partnerId}?month=${month}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [partnerId, month]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: SURF, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 600, padding: '28px 32px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: INTER, fontSize: 17, fontWeight: 800, color: TEXT_PR, margin: 0 }}>
            Månadsavräkning
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Partner
            </label>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 13, background: BG_BASE, outline: 'none' }}>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.partner_name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Månad
            </label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, background: BG_BASE, outline: 'none' }} />
          </div>
        </div>

        {loading && <p style={{ textAlign: 'center', color: TEXT_MUT, fontFamily: INTER }}>Hämtar…</p>}

        {data && !loading && (
          <>
            {/* Balance banner */}
            <div style={{
              borderRadius: 12, padding: '16px 20px', marginBottom: 20,
              background: data.net_balance_sek >= 0 ? D_GREEN + '12' : D_RED + '12',
              border: `1.5px solid ${data.net_balance_sek >= 0 ? D_GREEN + '40' : D_RED + '40'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_SEC, textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 2 }}>
                  Nettosaldo — {data.partner.partner_name}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 24, fontWeight: 900,
                  color: data.net_balance_sek >= 0 ? D_GREEN : D_RED,
                  fontVariantNumeric: 'tabular-nums' }}>
                  {data.net_balance_sek >= 0 ? '+' : ''}{data.net_balance_sek.toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, textAlign: 'right' }}>
                {data.de_skyldig_oss
                  ? <><strong>{data.partner.partner_name}</strong><br />är skyldig oss</>
                  : <>Vi är skyldiga<br /><strong>{data.partner.partner_name}</strong></>
                }
              </div>
            </div>

            {/* Two columns: out + in */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Vi skickade ut', d: data.ut, riktning: 'ut' },
                { label: 'Vi tog emot', d: data.in, riktning: 'in' },
              ].map(({ label, d, riktning }) => (
                <div key={riktning} style={{ background: BG_BASE, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    {riktning === 'ut'
                      ? <ArrowUpRight size={14} color={D_AMBER} />
                      : <ArrowDownLeft size={14} color={D_BLUE} />}
                    <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 700, color: TEXT_PR }}>
                      {label}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      ['Jobb', d.jobb],
                      ['Utförda', d.utfört],
                      ['Totalt', d.total_sek.toLocaleString('sv-SE') + ' kr'],
                      [riktning === 'ut' ? 'Avgift intjänad' : 'Avgift betald', d.avgift_sek.toLocaleString('sv-SE') + ' kr'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: TEXT_PR, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Row list */}
            {[...data.ut.rows, ...data.in.rows].length > 0 && (
              <div>
                <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, color: TEXT_MUT,
                  letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Jobb denna period
                </div>
                {[...data.ut.rows, ...data.in.rows].map((r) => (
                  <div key={r.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: `1px solid ${BORDER}`,
                  }}>
                    <div>
                      <span style={{ fontFamily: INTER, fontSize: 12, color: TEXT_PR }}>
                        {r.lasttyp || 'Jobb'}{r.upphämtning ? ` · ${r.upphämtning}` : ''}
                        {r.leverans ? ` → ${r.leverans}` : ''}
                      </span>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                        {r.riktning === 'ut'
                          ? <ArrowUpRight size={10} color={D_AMBER} />
                          : <ArrowDownLeft size={10} color={D_BLUE} />}
                        <StatusPill status={r.status} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: TEXT_PR,
                        fontVariantNumeric: 'tabular-nums' }}>
                        {r.overenskommet_totalpris_sek?.toLocaleString('sv-SE') ?? '—'} kr
                      </div>
                      <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT }}>
                        avgift {r.partner_pris_sek != null
                          ? (r.overenskommet_totalpris_sek - r.partner_pris_sek).toLocaleString('sv-SE')
                          : '—'} kr
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Natverk() {
  const [tab, setTab]                   = useState('partners'); // 'partners' | 'referrals'
  const [partners, setPartners]         = useState([]);
  const [referrals, setReferrals]       = useState([]);
  const [stats, setStats]               = useState(null);
  const [loading, setLoading]           = useState(true);

  const [showPartnerModal, setShowPartnerModal]   = useState(false);
  const [editPartner, setEditPartner]             = useState(null);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showSettlement, setShowSettlement]       = useState(false);

  const [filterPartner, setFilterPartner] = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterDir, setFilterDir]         = useState('');

  const [expandedId, setExpandedId] = useState(null);
  const [statusEdit, setStatusEdit] = useState({}); // { [id]: newStatus }

  const load = useCallback(() => {
    setLoading(true);
    const j = (r) => r.ok ? r.json() : Promise.reject(r.status);
    Promise.all([
      apiFetch('/api/natverk/partners').then(j),
      apiFetch('/api/natverk/referrals').then(j),
      apiFetch('/api/natverk/stats').then(j),
    ]).then(([p, r, s]) => {
      setPartners(Array.isArray(p) ? p : []);
      setReferrals(Array.isArray(r) ? r : []);
      setStats(s);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deletePartner(id) {
    if (!window.confirm('Ta bort partner?')) return;
    await apiFetch(`/api/natverk/partners/${id}`, { method: 'DELETE' });
    load();
  }

  async function updateReferralStatus(id, status) {
    await apiFetch(`/api/natverk/referrals/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    load();
  }

  const filteredReferrals = referrals.filter((r) => {
    if (filterPartner && r.partner_company_id !== parseInt(filterPartner, 10)) return false;
    if (filterStatus  && r.status !== filterStatus)                             return false;
    if (filterDir     && r.riktning !== filterDir)                              return false;
    return true;
  });

  return (
    <div style={{ padding: '28px 32px', fontFamily: INTER }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: INTER, fontSize: 22, fontWeight: 900, color: TEXT_PR, margin: 0, letterSpacing: '-0.02em' }}>
            Nätverk
          </h1>
          <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT, margin: '4px 0 0' }}>
            Samarbetspartners och jobbutbyten med betrodda åkerier.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {partners.length > 0 && (
            <button onClick={() => setShowSettlement(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 10, border: `1px solid ${BORDER}`,
              background: SURF, fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', color: TEXT_SEC,
            }}>
              <FileText size={14} />
              Avräkning
            </button>
          )}
          <button onClick={() => setShowReferralModal(true)} disabled={partners.length === 0} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: partners.length === 0 ? '#ccc' : '#3b82f6',
            color: '#fff', fontFamily: INTER, fontSize: 13, fontWeight: 700,
            cursor: partners.length === 0 ? 'not-allowed' : 'pointer',
          }}>
            <Send size={14} />
            Lägg ut jobb
          </button>
          <button onClick={() => { setEditPartner(null); setShowPartnerModal(true); }} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: ACCENT, color: '#fff', fontFamily: INTER, fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
          }}>
            <Plus size={14} />
            Ny partner
          </button>
        </div>
      </div>

      {/* KPI row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          <KpiCard label="Aktiva partners"        value={stats.partners}    icon={Building2} />
          <KpiCard label="Aktiva jobbbyten"       value={stats.aktiva}      icon={Network} color={D_BLUE} />
          <KpiCard label="Väntande förmedling"    value={`${stats.pending_sek?.toLocaleString('sv-SE')} kr`}
            icon={Clock} color={D_AMBER} sub="ej utförda jobb ut" />
          <KpiCard label="Intjänad förmedlingsavg."  value={`${stats.intjänat_sek?.toLocaleString('sv-SE')} kr`}
            icon={BarChart3} color={D_GREEN} sub="utförda jobb ut" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${BORDER}`, paddingBottom: 0 }}>
        {[['partners', 'Partners'], ['referrals', 'Jobbbyten']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none',
            background: tab === id ? SURF : 'transparent',
            borderBottom: tab === id ? `2px solid ${ACCENT}` : '2px solid transparent',
            fontFamily: INTER, fontSize: 13, fontWeight: tab === id ? 700 : 500,
            color: tab === id ? TEXT_PR : TEXT_MUT, cursor: 'pointer',
          }}>
            {label}
            {id === 'referrals' && referrals.length > 0 && (
              <span style={{ marginLeft: 6, background: ACCENT_SF, color: TEXT_SEC,
                borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {referrals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: TEXT_MUT, textAlign: 'center', padding: 40 }}>Hämtar…</p>}

      {/* ── Partners tab ── */}
      {!loading && tab === 'partners' && (
        <>
          {partners.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Network size={40} color={TEXT_MUT} style={{ marginBottom: 12 }} />
              <p style={{ fontFamily: INTER, fontSize: 15, fontWeight: 700, color: TEXT_PR, margin: '0 0 6px' }}>
                Inga partners ännu
              </p>
              <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT, margin: '0 0 20px' }}>
                Lägg till ett betrott åkeri för att börja vidarebefordra och ta emot jobb.
              </p>
              <button onClick={() => setShowPartnerModal(true)} style={{
                padding: '10px 22px', borderRadius: 10, border: 'none',
                background: ACCENT, color: '#fff', fontFamily: INTER, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                Lägg till första partner
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {partners.map((p) => (
                <div key={p.id} style={{
                  background: SURF, borderRadius: 14, boxShadow: SHADOW,
                  border: `1px solid ${BORDER}`, padding: '18px 20px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 800, color: TEXT_PR }}>
                        {p.partner_name}
                      </div>
                      {p.org_nr && (
                        <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT, marginTop: 2 }}>
                          {p.org_nr}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditPartner(p); setShowPartnerModal(true); }} style={{
                        background: ACCENT_SF, border: 'none', borderRadius: 7, padding: '5px 8px',
                        cursor: 'pointer', color: TEXT_SEC,
                      }}><Edit3 size={12} /></button>
                      <button onClick={() => deletePartner(p.id)} style={{
                        background: D_RED + '12', border: 'none', borderRadius: 7, padding: '5px 8px',
                        cursor: 'pointer', color: D_RED,
                      }}><Trash2 size={12} /></button>
                    </div>
                  </div>

                  {p.contact_name && (
                    <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_SEC, marginBottom: 6 }}>
                      {p.contact_name}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                    {p.contact_phone && (
                      <a href={`tel:${p.contact_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 4,
                        fontFamily: INTER, fontSize: 11, color: D_BLUE, textDecoration: 'none' }}>
                        <Phone size={10} />{p.contact_phone}
                      </a>
                    )}
                    {p.contact_email && (
                      <a href={`mailto:${p.contact_email}`} style={{ display: 'flex', alignItems: 'center', gap: 4,
                        fontFamily: INTER, fontSize: 11, color: D_BLUE, textDecoration: 'none' }}>
                        <Mail size={10} />{p.contact_email}
                      </a>
                    )}
                  </div>
                  {p.notes && (
                    <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT, marginBottom: 10,
                      background: BG_BASE, borderRadius: 6, padding: '6px 10px' }}>
                      {p.notes}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {[
                      ['Skickade', p.skickade_jobb],
                      ['Mottagna', p.mottagna_jobb],
                      ['Avgift intj.', p.intjänad_avgift_sek != null
                        ? Math.round(p.intjänad_avgift_sek).toLocaleString('sv-SE') + ' kr' : '—'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: BG_BASE, borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontFamily: INTER, fontSize: 9, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k}</div>
                        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 800, color: TEXT_PR, fontVariantNumeric: 'tabular-nums' }}>{v ?? 0}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Referrals tab ── */}
      {!loading && tab === 'referrals' && (
        <>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 12, background: SURF, color: TEXT_SEC, outline: 'none' }}>
              <option value="">Alla partners</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.partner_name}</option>)}
            </select>
            <select value={filterDir} onChange={(e) => setFilterDir(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 12, background: SURF, color: TEXT_SEC, outline: 'none' }}>
              <option value="">Alla riktningar</option>
              <option value="ut">Vi skickade ut</option>
              <option value="in">Vi tog emot</option>
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 12, background: SURF, color: TEXT_SEC, outline: 'none' }}>
              <option value="">Alla statusar</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {filteredReferrals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Send size={36} color={TEXT_MUT} style={{ marginBottom: 12 }} />
              <p style={{ fontFamily: INTER, fontSize: 15, fontWeight: 700, color: TEXT_PR, margin: '0 0 6px' }}>
                Inga jobbbyten ännu
              </p>
              <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT }}>
                Klicka "Lägg ut jobb" för att skicka ett uppdrag till en partner.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredReferrals.map((r) => {
                const isExpanded = expandedId === r.id;
                return (
                  <div key={r.id} style={{
                    background: SURF, borderRadius: 14, boxShadow: SHADOW,
                    border: `1px solid ${BORDER}`, overflow: 'hidden',
                  }}>
                    <div
                      style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    >
                      {/* Direction icon */}
                      <div style={{ flexShrink: 0 }}>
                        {r.riktning === 'ut'
                          ? <ArrowUpRight size={18} color={D_AMBER} />
                          : <ArrowDownLeft size={18} color={D_BLUE} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: TEXT_PR,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.lasttyp || 'Jobb'} — {r.partner_name}
                        </div>
                        <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT, marginTop: 2 }}>
                          {r.upphämtning && r.leverans ? `${r.upphämtning} → ${r.leverans}` : (r.upphämtning || r.leverans || '')}
                          {r.datum && ` · ${r.datum}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {r.overenskommet_totalpris_sek != null && (
                          <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 800, color: TEXT_PR,
                            fontVariantNumeric: 'tabular-nums' }}>
                            {r.overenskommet_totalpris_sek.toLocaleString('sv-SE')} kr
                          </span>
                        )}
                        <StatusPill status={r.status} />
                        {isExpanded ? <ChevronUp size={14} color={TEXT_MUT} /> : <ChevronDown size={14} color={TEXT_MUT} />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${BORDER}` }}>
                        <div style={{ paddingTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
                          {[
                            ['Totalpris',     r.overenskommet_totalpris_sek != null ? r.overenskommet_totalpris_sek.toLocaleString('sv-SE') + ' kr' : '—'],
                            ['Förmedlingsavgift', r.formedlingsavgift_pct + '%'],
                            ['Partner får',   r.partner_pris_sek != null ? r.partner_pris_sek.toLocaleString('sv-SE') + ' kr' : '—'],
                          ].map(([k, v]) => (
                            <div key={k} style={{ background: BG_BASE, borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontFamily: INTER, fontSize: 9, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                              <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: TEXT_PR, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                            </div>
                          ))}
                        </div>

                        {r.noteringar && (
                          <p style={{ fontFamily: INTER, fontSize: 12, color: TEXT_SEC, margin: '0 0 12px',
                            background: BG_BASE, borderRadius: 6, padding: '6px 10px' }}>
                            {r.noteringar}
                          </p>
                        )}

                        {/* Status actions */}
                        {r.status !== 'utfört' && r.status !== 'avvisad' && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {r.status === 'föreslagen' && (
                              <button onClick={() => updateReferralStatus(r.id, 'accepterad')} style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                                borderRadius: 7, border: 'none', background: D_BLUE + '18', color: D_BLUE,
                                fontFamily: INTER, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              }}>
                                <CheckCircle size={12} /> Acceptera
                              </button>
                            )}
                            {r.status === 'föreslagen' && (
                              <button onClick={() => updateReferralStatus(r.id, 'avvisad')} style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                                borderRadius: 7, border: 'none', background: D_RED + '12', color: D_RED,
                                fontFamily: INTER, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              }}>
                                <XCircle size={12} /> Avvisa
                              </button>
                            )}
                            {r.status === 'accepterad' && (
                              <button onClick={() => updateReferralStatus(r.id, 'utfört')} style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                                borderRadius: 7, border: 'none', background: D_GREEN + '15', color: D_GREEN,
                                fontFamily: INTER, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              }}>
                                <CheckCircle size={12} /> Markera utfört
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showPartnerModal && (
        <PartnerModal
          partner={editPartner}
          onClose={() => { setShowPartnerModal(false); setEditPartner(null); }}
          onSave={() => { setShowPartnerModal(false); setEditPartner(null); load(); }}
        />
      )}
      {showReferralModal && (
        <ReferralModal
          partners={partners}
          onClose={() => setShowReferralModal(false)}
          onSave={() => { setShowReferralModal(false); load(); }}
        />
      )}
      {showSettlement && partners.length > 0 && (
        <SettlementPanel
          partners={partners}
          onClose={() => setShowSettlement(false)}
        />
      )}
    </div>
  );
}
