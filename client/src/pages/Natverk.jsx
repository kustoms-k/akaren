import { useState, useEffect, useCallback } from 'react';
import {
  Network, Plus, Trash2, Edit3, CheckCircle, XCircle, Clock,
  ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp, Phone,
  Mail, Building2, BarChart3, X, Send, FileText,
} from 'lucide-react';
import { apiFetch } from '../utils/apiFetch.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const INTER     = "'Geist', system-ui, sans-serif";
const BG_BASE   = '#f4f5f7';
const SURF      = '#ffffff';
const ACCENT    = '#2d3340';
const ACCENT_SF = '#eef0f3';
const BORDER    = '#ececef';
const TEXT_PR   = '#1a1d24';
const TEXT_SEC  = '#4b5563';
const TEXT_MUT  = '#6b7280';
const SHADOW    = '0 1px 4px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06)';
const D_GREEN   = '#16a34a';
const D_AMBER   = '#d97706';
const D_RED     = '#dc2626';
const D_BLUE    = '#2563eb';

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
          fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_MUT, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_SEC, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function StatusPill({ status, t }) {
  const meta = {
    föreslagen: { color: D_AMBER, Icon: Clock },
    accepterad: { color: D_BLUE,  Icon: CheckCircle },
    avvisad:    { color: D_RED,   Icon: XCircle },
    utfört:     { color: D_GREEN, Icon: CheckCircle },
  };
  const m = meta[status] ?? { color: TEXT_MUT, Icon: Clock };
  const label = t.natverk.status[status] ?? status;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      background: m.color + '18', color: m.color,
      fontSize: 11, fontWeight: 700, fontFamily: INTER,
    }}>
      <m.Icon size={10} />{label}
    </span>
  );
}

function PartnerModal({ partner, onClose, onSave, t }) {
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
    if (!form.partner_name.trim()) { setErr(t.natverk.partner.nameRequired); return; }
    setSaving(true); setErr('');
    try {
      const method = partner ? 'PUT' : 'POST';
      const url    = partner ? `/api/natverk/partners/${partner.id}` : '/api/natverk/partners';
      const r = await apiFetch(url, { method, body: JSON.stringify(form) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onSave();
    } catch (ex) { setErr(ex.message ?? t.natverk.partner.nameRequired); }
    finally { setSaving(false); }
  }

  const fieldStyle = (label, key, type = 'text', ph = '') => (
    <div style={{ marginBottom: 14 }}>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: SURF, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 480, padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontFamily: INTER, fontSize: 17, fontWeight: 800, color: TEXT_PR, margin: 0 }}>
            {partner ? t.natverk.partner.editModal : t.natverk.partner.addModal}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT }}><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          {fieldStyle(t.natverk.partner.name,    'partner_name', 'text', 'T.ex. Söderberg Transport AB')}
          {fieldStyle(t.natverk.partner.orgNr,   'org_nr',       'text', '556XXX-XXXX')}
          {fieldStyle(t.natverk.partner.contact, 'contact_name')}
          {fieldStyle(t.natverk.partner.phone,   'contact_phone','tel',  '+46700000000')}
          {fieldStyle(t.natverk.partner.email,   'contact_email','email','kontakt@foretag.se')}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {t.natverk.partner.notes}
            </label>
            <textarea value={form.notes} onChange={set('notes')} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, color: TEXT_PR,
                resize: 'vertical', outline: 'none', background: BG_BASE }} />
          </div>
          {err && <p style={{ color: D_RED, fontSize: 12, fontFamily: INTER, marginBottom: 10 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8,
              border: `1px solid ${BORDER}`, background: 'none', fontFamily: INTER, fontSize: 13,
              cursor: 'pointer', color: TEXT_SEC }}>{t.natverk.partner.cancel}</button>
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 8,
              border: 'none', background: ACCENT, color: '#fff', fontFamily: INTER, fontSize: 13,
              fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? t.natverk.partner.saving : t.natverk.partner.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReferralModal({ partners, onClose, onSave, t }) {
  const [form, setForm] = useState({
    partner_company_id: '', riktning: 'ut', lasttyp: '', upphämtning: '',
    leverans: '', datum: '', overenskommet_totalpris_sek: '',
    formedlingsavgift_pct: '10', noteringar: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const total  = parseFloat(form.overenskommet_totalpris_sek) || 0;
  const pct    = parseFloat(form.formedlingsavgift_pct)       || 10;
  const avgift = total > 0 ? Math.round(total * pct / 100) : null;
  const partnerFår = total > 0 ? Math.round(total * (1 - pct / 100)) : null;

  async function submit(e) {
    e.preventDefault();
    if (!form.partner_company_id) { setErr(t.natverk.referral.partnerReq); return; }
    setSaving(true); setErr('');
    try {
      const body = { ...form, partner_company_id: parseInt(form.partner_company_id, 10),
        overenskommet_totalpris_sek: total || null, formedlingsavgift_pct: pct };
      const r = await apiFetch('/api/natverk/referrals', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      onSave();
    } catch (ex) { setErr(ex.message ?? 'Fel'); }
    finally { setSaving(false); }
  }

  const inp = (label, key, type = 'text', ph = '') => (
    <div>
      <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
        color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</label>
      <input type={type} value={form[key]} onChange={set(key)} placeholder={ph}
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
          border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, color: TEXT_PR,
          outline: 'none', background: BG_BASE }} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: SURF, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 520, padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontFamily: INTER, fontSize: 17, fontWeight: 800, color: TEXT_PR, margin: 0 }}>
            {t.natverk.referral.modal}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT }}><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {t.natverk.referral.partner}
            </label>
            <select value={form.partner_company_id} onChange={set('partner_company_id')}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 13, color: TEXT_PR, background: BG_BASE, outline: 'none' }}>
              <option value="">{t.natverk.referral.selectPartner}</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.partner_name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {t.natverk.referral.direction}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['ut', t.natverk.referral.out], ['in', t.natverk.referral.in]].map(([val, lbl]) => (
                <label key={val} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', borderRadius: 8,
                  border: `1.5px solid ${form.riktning === val ? ACCENT : BORDER}`,
                  cursor: 'pointer', fontFamily: INTER, fontSize: 13,
                  background: form.riktning === val ? ACCENT_SF : 'transparent' }}>
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
            {inp(t.natverk.referral.cargo,    'lasttyp',    'text', 'T.ex. Grävmaskin')}
            {inp(t.natverk.referral.date,     'datum',      'date')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {inp(t.natverk.referral.pickup,   'upphämtning','text', 'Adress')}
            {inp(t.natverk.referral.delivery, 'leverans',   'text', 'Adress')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {inp(t.natverk.referral.price,    'overenskommet_totalpris_sek', 'number', '0')}
            {inp(t.natverk.referral.fee,      'formedlingsavgift_pct',       'number', '10')}
          </div>
          {total > 0 && (
            <div style={{ background: BG_BASE, borderRadius: 10, padding: '12px 16px', marginBottom: 14,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {form.riktning === 'ut' ? t.natverk.referral.weKeep : t.natverk.referral.wePay}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 16, fontWeight: 800,
                  color: form.riktning === 'ut' ? D_GREEN : D_AMBER,
                  fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                  {avgift?.toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div>
                <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {form.riktning === 'ut' ? t.natverk.referral.partnerGets : t.natverk.referral.partnerInv}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 16, fontWeight: 800, color: TEXT_PR,
                  fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                  {partnerFår?.toLocaleString('sv-SE')} kr
                </div>
              </div>
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
              color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {t.natverk.partner.notes}
            </label>
            <textarea value={form.noteringar} onChange={set('noteringar')} rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, color: TEXT_PR,
                resize: 'vertical', outline: 'none', background: BG_BASE }} />
          </div>
          {err && <p style={{ color: D_RED, fontSize: 12, fontFamily: INTER, marginBottom: 10 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8,
              border: `1px solid ${BORDER}`, background: 'none', fontFamily: INTER, fontSize: 13,
              cursor: 'pointer', color: TEXT_SEC }}>{t.natverk.referral.cancel}</button>
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 8,
              border: 'none', background: ACCENT, color: '#fff', fontFamily: INTER, fontSize: 13,
              fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={13} />
              {saving ? t.natverk.referral.sending : t.natverk.referral.send}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SettlementPanel({ partners, onClose, t }) {
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: SURF, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        width: '100%', maxWidth: 600, padding: '28px 32px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: INTER, fontSize: 17, fontWeight: 800, color: TEXT_PR, margin: 0 }}>
            {t.natverk.settlement.title}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT }}><X size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            [t.natverk.settlement.partner, 'select'],
            [t.natverk.settlement.month,   'month'],
          ].map(([lbl, type]) => (
            <div key={lbl}>
              <label style={{ display: 'block', fontFamily: INTER, fontSize: 11, fontWeight: 600,
                color: TEXT_SEC, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{lbl}</label>
              {type === 'select'
                ? <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                      fontFamily: INTER, fontSize: 13, background: BG_BASE, outline: 'none' }}>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.partner_name}</option>)}
                  </select>
                : <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
                      border: `1px solid ${BORDER}`, fontFamily: INTER, fontSize: 13, background: BG_BASE, outline: 'none' }} />
              }
            </div>
          ))}
        </div>
        {loading && <p style={{ textAlign: 'center', color: TEXT_MUT, fontFamily: INTER }}>{t.natverk.settlement.loading}</p>}
        {data && !loading && (
          <>
            <div style={{ borderRadius: 12, padding: '16px 20px', marginBottom: 20,
              background: data.net_balance_sek >= 0 ? D_GREEN + '12' : D_RED + '12',
              border: `1.5px solid ${data.net_balance_sek >= 0 ? D_GREEN + '40' : D_RED + '40'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_SEC, textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 2 }}>
                  {t.natverk.settlement.netBalance} — {data.partner.partner_name}
                </div>
                <div style={{ fontFamily: INTER, fontSize: 24, fontWeight: 900,
                  color: data.net_balance_sek >= 0 ? D_GREEN : D_RED,
                  fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                  {data.net_balance_sek >= 0 ? '+' : ''}{data.net_balance_sek.toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, textAlign: 'right' }}>
                {data.de_skyldig_oss
                  ? <><strong>{data.partner.partner_name}</strong><br />{t.natverk.settlement.owes}</>
                  : <>{t.natverk.settlement.weOwe}<br /><strong>{data.partner.partner_name}</strong></>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: t.natverk.settlement.sentOut,  d: data.ut, dir: 'ut' },
                { label: t.natverk.settlement.received, d: data.in, dir: 'in' },
              ].map(({ label, d, dir }) => (
                <div key={dir} style={{ background: BG_BASE, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    {dir === 'ut' ? <ArrowUpRight size={14} color={D_AMBER} /> : <ArrowDownLeft size={14} color={D_BLUE} />}
                    <span style={{ fontFamily: INTER, fontSize: 12, fontWeight: 700, color: TEXT_PR }}>{label}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      [t.natverk.settlement.jobs,      d.jobb],
                      [t.natverk.settlement.completed, d.utfört],
                      [t.natverk.settlement.total,     d.total_sek.toLocaleString('sv-SE') + ' kr'],
                      [dir === 'ut' ? t.natverk.settlement.feeEarned : t.natverk.settlement.feePaid,
                       d.avgift_sek.toLocaleString('sv-SE') + ' kr'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 700, color: TEXT_PR, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {[...data.ut.rows, ...data.in.rows].length > 0 && (
              <div>
                <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, color: TEXT_MUT,
                  letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {t.natverk.settlement.thisperiod}
                </div>
                {[...data.ut.rows, ...data.in.rows].map((r) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: `1px solid ${BORDER}` }}>
                    <div>
                      <span style={{ fontFamily: INTER, fontSize: 12, color: TEXT_PR }}>
                        {r.lasttyp || 'Jobb'}{r.upphämtning ? ` · ${r.upphämtning}` : ''}{r.leverans ? ` → ${r.leverans}` : ''}
                      </span>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                        {r.riktning === 'ut' ? <ArrowUpRight size={10} color={D_AMBER} /> : <ArrowDownLeft size={10} color={D_BLUE} />}
                        <StatusPill status={r.status} t={t} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: TEXT_PR,
                        fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                        {r.overenskommet_totalpris_sek?.toLocaleString('sv-SE') ?? '—'} kr
                      </div>
                      <div style={{ fontFamily: INTER, fontSize: 10, color: TEXT_MUT }}>
                        {t.natverk.settlement.fee} {r.partner_pris_sek != null
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

export default function Natverk() {
  const { t } = useLanguage();
  const [tab, setTab]                   = useState('partners');
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
  const [expandedId, setExpandedId]       = useState(null);

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
    if (!window.confirm(t.natverk.partner.confirmDelete)) return;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: INTER, fontSize: 24, fontWeight: 700, color: TEXT_PR, margin: 0, letterSpacing: '-0.02em' }}>
            {t.natverk.title}
          </h1>
          <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT, margin: '4px 0 0' }}>
            {t.natverk.subtitle}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {partners.length > 0 && (
            <button onClick={() => setShowSettlement(true)} style={{ display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 10, border: `1px solid ${BORDER}`,
              background: SURF, fontFamily: INTER, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: TEXT_SEC }}>
              <FileText size={14} />{t.natverk.actions.settlement}
            </button>
          )}
          <button onClick={() => setShowReferralModal(true)} disabled={partners.length === 0} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none',
            background: partners.length === 0 ? '#ccc' : '#3b82f6', color: '#fff',
            fontFamily: INTER, fontSize: 13, fontWeight: 700, cursor: partners.length === 0 ? 'not-allowed' : 'pointer' }}>
            <Send size={14} />{t.natverk.actions.sendJob}
          </button>
          <button onClick={() => { setEditPartner(null); setShowPartnerModal(true); }} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none',
            background: ACCENT, color: '#fff', fontFamily: INTER, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={14} />{t.natverk.actions.newPartner}
          </button>
        </div>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          <KpiCard label={t.natverk.kpi.partners} value={stats.partners}    icon={Building2} />
          <KpiCard label={t.natverk.kpi.active}   value={stats.aktiva}      icon={Network} color={D_BLUE} />
          <KpiCard label={t.natverk.kpi.pending}
            value={`${stats.pending_sek?.toLocaleString('sv-SE')} kr`}
            icon={Clock} color={D_AMBER} sub={t.natverk.kpi.pendingSub} />
          <KpiCard label={t.natverk.kpi.earned}
            value={`${stats.intjänat_sek?.toLocaleString('sv-SE')} kr`}
            icon={BarChart3} color={D_GREEN} sub={t.natverk.kpi.earnedSub} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
        {[['partners', t.natverk.tabs.partners], ['referrals', t.natverk.tabs.referrals]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none',
            background: tab === id ? SURF : 'transparent',
            borderBottom: tab === id ? `2px solid ${ACCENT}` : '2px solid transparent',
            fontFamily: INTER, fontSize: 13, fontWeight: tab === id ? 700 : 500,
            color: tab === id ? TEXT_PR : TEXT_MUT, cursor: 'pointer' }}>
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

      {loading && <p style={{ color: TEXT_MUT, textAlign: 'center', padding: 40 }}>{t.natverk.settlement.loading}</p>}

      {!loading && tab === 'partners' && (
        <>
          {partners.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Network size={40} color={TEXT_MUT} style={{ marginBottom: 12 }} />
              <p style={{ fontFamily: INTER, fontSize: 15, fontWeight: 700, color: TEXT_PR, margin: '0 0 6px' }}>
                {t.natverk.partner.noPartners}
              </p>
              <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT, margin: '0 0 20px' }}>
                {t.natverk.partner.noPartnersDesc}
              </p>
              <button onClick={() => setShowPartnerModal(true)} style={{ padding: '10px 22px', borderRadius: 10,
                border: 'none', background: ACCENT, color: '#fff', fontFamily: INTER, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {t.natverk.actions.addFirst}
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {partners.map((p) => (
                <div key={p.id} style={{ background: SURF, borderRadius: 14, boxShadow: SHADOW,
                  border: `1px solid ${BORDER}`, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 800, color: TEXT_PR }}>{p.partner_name}</div>
                      {p.org_nr && <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT, marginTop: 2 }}>{p.org_nr}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditPartner(p); setShowPartnerModal(true); }} style={{
                        background: ACCENT_SF, border: 'none', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: TEXT_SEC }}>
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => deletePartner(p.id)} style={{
                        background: D_RED + '12', border: 'none', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: D_RED }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  {p.contact_name && <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT_SEC, marginBottom: 6 }}>{p.contact_name}</div>}
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
                  {p.notes && <div style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MUT, marginBottom: 10,
                    background: BG_BASE, borderRadius: 6, padding: '6px 10px' }}>{p.notes}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {[
                      [t.natverk.partner.sent,     p.skickade_jobb],
                      [t.natverk.partner.received, p.mottagna_jobb],
                      [t.natverk.partner.fee,      p.intjänad_avgift_sek != null
                        ? Math.round(p.intjänad_avgift_sek).toLocaleString('sv-SE') + ' kr' : '—'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: BG_BASE, borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontFamily: INTER, fontSize: 9, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k}</div>
                        <div style={{ fontFamily: INTER, fontSize: 14, fontWeight: 800, color: TEXT_PR, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{v ?? 0}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && tab === 'referrals' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 12, background: SURF, color: TEXT_SEC, outline: 'none' }}>
              <option value="">{t.natverk.referral.allPartners}</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.partner_name}</option>)}
            </select>
            <select value={filterDir} onChange={(e) => setFilterDir(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 12, background: SURF, color: TEXT_SEC, outline: 'none' }}>
              <option value="">{t.natverk.referral.allDirections}</option>
              <option value="ut">{t.natverk.referral.filterOut}</option>
              <option value="in">{t.natverk.referral.filterIn}</option>
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                fontFamily: INTER, fontSize: 12, background: SURF, color: TEXT_SEC, outline: 'none' }}>
              <option value="">{t.natverk.referral.allStatuses}</option>
              {Object.entries(t.natverk.status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {filteredReferrals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <Send size={36} color={TEXT_MUT} style={{ marginBottom: 12 }} />
              <p style={{ fontFamily: INTER, fontSize: 15, fontWeight: 700, color: TEXT_PR, margin: '0 0 6px' }}>
                {t.natverk.referral.noReferrals}
              </p>
              <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_MUT }}>
                {t.natverk.referral.noReferralsDesc}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredReferrals.map((r) => {
                const isExpanded = expandedId === r.id;
                return (
                  <div key={r.id} style={{ background: SURF, borderRadius: 14, boxShadow: SHADOW,
                    border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                      <div style={{ flexShrink: 0 }}>
                        {r.riktning === 'ut' ? <ArrowUpRight size={18} color={D_AMBER} /> : <ArrowDownLeft size={18} color={D_BLUE} />}
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
                            fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>
                            {r.overenskommet_totalpris_sek.toLocaleString('sv-SE')} kr
                          </span>
                        )}
                        <StatusPill status={r.status} t={t} />
                        {isExpanded ? <ChevronUp size={14} color={TEXT_MUT} /> : <ChevronDown size={14} color={TEXT_MUT} />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${BORDER}` }}>
                        <div style={{ paddingTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
                          {[
                            [t.natverk.referral.details.total, r.overenskommet_totalpris_sek != null ? r.overenskommet_totalpris_sek.toLocaleString('sv-SE') + ' kr' : '—'],
                            [t.natverk.referral.details.fee,   r.formedlingsavgift_pct + '%'],
                            [t.natverk.referral.details.gets,  r.partner_pris_sek != null ? r.partner_pris_sek.toLocaleString('sv-SE') + ' kr' : '—'],
                          ].map(([k, v]) => (
                            <div key={k} style={{ background: BG_BASE, borderRadius: 8, padding: '8px 10px' }}>
                              <div style={{ fontFamily: INTER, fontSize: 9, color: TEXT_MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                              <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 700, color: TEXT_PR, fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {r.noteringar && (
                          <p style={{ fontFamily: INTER, fontSize: 12, color: TEXT_SEC, margin: '0 0 12px',
                            background: BG_BASE, borderRadius: 6, padding: '6px 10px' }}>{r.noteringar}</p>
                        )}
                        {r.status !== 'utfört' && r.status !== 'avvisad' && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {r.status === 'föreslagen' && (
                              <button onClick={() => updateReferralStatus(r.id, 'accepterad')} style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                                borderRadius: 7, border: 'none', background: D_BLUE + '18', color: D_BLUE,
                                fontFamily: INTER, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                <CheckCircle size={12} /> {t.natverk.actions.accept}
                              </button>
                            )}
                            {r.status === 'föreslagen' && (
                              <button onClick={() => updateReferralStatus(r.id, 'avvisad')} style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                                borderRadius: 7, border: 'none', background: D_RED + '12', color: D_RED,
                                fontFamily: INTER, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                <XCircle size={12} /> {t.natverk.actions.decline}
                              </button>
                            )}
                            {r.status === 'accepterad' && (
                              <button onClick={() => updateReferralStatus(r.id, 'utfört')} style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                                borderRadius: 7, border: 'none', background: D_GREEN + '15', color: D_GREEN,
                                fontFamily: INTER, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                <CheckCircle size={12} /> {t.natverk.actions.markDone}
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

      {showPartnerModal && (
        <PartnerModal partner={editPartner}
          onClose={() => { setShowPartnerModal(false); setEditPartner(null); }}
          onSave={() => { setShowPartnerModal(false); setEditPartner(null); load(); }}
          t={t} />
      )}
      {showReferralModal && (
        <ReferralModal partners={partners}
          onClose={() => setShowReferralModal(false)}
          onSave={() => { setShowReferralModal(false); load(); }}
          t={t} />
      )}
      {showSettlement && partners.length > 0 && (
        <SettlementPanel partners={partners} onClose={() => setShowSettlement(false)} t={t} />
      )}
    </div>
  );
}
