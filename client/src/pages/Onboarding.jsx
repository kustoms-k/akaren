import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useAuth }  from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LogoFull } from '../assets/Logo.jsx';

const AMBER   = '#c9921e';
const BLUE    = AMBER;
const AMBER_DK= '#a87818';
const BLUE_DK = AMBER_DK;
const BG      = '#edeae1';
const WHITE   = '#ffffff';
const SURF    = '#f4f0e7';
const BORDER  = '#cfc9bb';
const TEXT    = '#151210';
const MUTED   = '#6a6050';
const GREEN   = '#2ecc71';
const OUTFIT  = "'Plus Jakarta Sans', system-ui, sans-serif";
const INTER   = OUTFIT;

const STEP_IDS = ['company', 'fleet', 'pricing', 'customer', 'demo'];

const FLEET_PRESETS = [
  { typ: 'Skåpbil',          lasttyp: 'Styckegods',     timkostnad_sek: 550,  priskm_sek: 16,  startavgift_sek: 350,  max_last_kg: 2500,  volym_m3: 18,  lez_godkand: true,  euro_klass: 6 },
  { typ: 'Lastbil',          lasttyp: 'Frakt',           timkostnad_sek: 750,  priskm_sek: 22,  startavgift_sek: 600,  max_last_kg: 10000, volym_m3: 40,  lez_godkand: true,  euro_klass: 6 },
  { typ: 'Lastbil med släp', lasttyp: 'Frakt',           timkostnad_sek: 1100, priskm_sek: 38,  startavgift_sek: 1200, max_last_kg: 26000, volym_m3: 90,  lez_godkand: false, euro_klass: 4 },
  { typ: 'Kranbil',          lasttyp: 'Tung last',       timkostnad_sek: 1400, priskm_sek: 45,  startavgift_sek: 1500, max_last_kg: 20000, volym_m3: 50,  lez_godkand: false, euro_klass: 5 },
  { typ: 'Lastväxlare',      lasttyp: 'Containertrafik', timkostnad_sek: 950,  priskm_sek: 30,  startavgift_sek: 900,  max_last_kg: 18000, volym_m3: 0,   lez_godkand: false, euro_klass: 5 },
  { typ: 'Kyllastbil',       lasttyp: 'Kylfrakt',        timkostnad_sek: 850,  priskm_sek: 32,  startavgift_sek: 900,  max_last_kg: 12000, volym_m3: 45,  lez_godkand: true,  euro_klass: 6 },
  { typ: 'Tankbil',          lasttyp: 'Flytande gods',   timkostnad_sek: 1200, priskm_sek: 42,  startavgift_sek: 1400, max_last_kg: 22000, volym_m3: 20,  lez_godkand: false, euro_klass: 4 },
  { typ: 'Betongbil',        lasttyp: 'Betong',          timkostnad_sek: 1100, priskm_sek: 35,  startavgift_sek: 1100, max_last_kg: 16000, volym_m3: 8,   lez_godkand: false, euro_klass: 5 },
];

// ── Confetti ──────────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#4361ee','#2ecc71','#f59e0b','#e74c3c','#a78bfa','#60a5fa','#f472b6'];
function Confetti() {
  const particles = Array.from({ length: 70 }, (_, i) => ({
    id:    i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left:  `${Math.random() * 100}%`,
    delay: `${Math.random() * 2.5}s`,
    dur:   `${1.8 + Math.random() * 1.8}s`,
    rot:   Math.random() * 360,
    w:     `${6 + Math.random() * 8}px`,
    h:     `${3 + Math.random() * 5}px`,
  }));
  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-40px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(var(--r)); opacity: 0; }
        }
      `}</style>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
        {particles.map((p) => (
          <div key={p.id} style={{
            position: 'absolute', top: 0, left: p.left,
            width: p.w, height: p.h,
            background: p.color, borderRadius: 2,
            animation: `confettiFall ${p.dur} ${p.delay} ease-in forwards`,
            '--r': `${p.rot}deg`,
          }} />
        ))}
      </div>
    </>
  );
}

// ── Shared UI bits ────────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <label style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  );
}
function TextInput({ value, onChange, placeholder, type = 'text', disabled }) {
  const [f, setF] = useState(false);
  return (
    <input
      type={type} value={value ?? ''} onChange={onChange} placeholder={placeholder}
      disabled={disabled}
      style={{
        fontFamily: INTER, fontSize: 13, color: TEXT, background: WHITE,
        border: `1.5px solid ${f ? BLUE : BORDER}`, borderRadius: 8,
        padding: '9px 12px', width: '100%', boxSizing: 'border-box', outline: 'none',
        boxShadow: f ? '0 0 0 3px rgba(201,168,76,0.14)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        opacity: disabled ? 0.6 : 1,
      }}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
    />
  );
}
function Btn({ onClick, disabled, children, variant = 'primary', small }) {
  const [h, setH] = useState(false);
  const bg = variant === 'primary'
    ? (disabled ? '#ddd9d2' : h ? BLUE_DK : BLUE)
    : (h ? BG : WHITE);
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        fontFamily: INTER, fontWeight: 600,
        fontSize: small ? 12 : 14,
        padding: small ? '6px 14px' : '10px 22px',
        borderRadius: 8, border: variant === 'ghost' ? `1px solid ${BORDER}` : 'none',
        background: bg, color: variant === 'primary' ? (disabled ? '#a09aa8' : TEXT) : TEXT,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ── Step progress bar ─────────────────────────────────────────────────────────
function StepBar({ current }) {
  const { t } = useLanguage();
  const steps = t.onboarding.steps;
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
      {STEP_IDS.map((id, i) => (
        <div key={id} style={{ flex: 1 }}>
          <div style={{
            height: 4, borderRadius: 2,
            background: i < current ? GREEN : i === current ? BLUE : BORDER,
            transition: 'background 0.3s',
          }} />
          <div style={{
            fontFamily: INTER, fontSize: 10, marginTop: 4, fontWeight: 500,
            color: i <= current ? TEXT : MUTED,
            textAlign: 'center',
          }}>
            {i + 1}. {steps[id]}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Company details ───────────────────────────────────────────────────
function StepCompany({ data, onChange, onNext }) {
  const { t } = useLanguage();
  const s1 = t.onboarding.step1;
  const [looking, setLooking] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);

  async function handleLookup() {
    if (!data.org_nr?.trim()) return;
    setLooking(true);
    try {
      const r    = await apiFetch(`/api/onboarding/lookup-org?orgnr=${encodeURIComponent(data.org_nr)}`);
      const json = await r.json();
      if (json.found) {
        if (json.name)    onChange('name',    json.name);
        if (json.address) onChange('address', [json.address, json.city].filter(Boolean).join(', '));
      }
    } catch { /* ignore */ } finally { setLooking(false); }
  }

  function handleLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300_000) { alert(s1.logoError); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoPreview(ev.target.result);
      onChange('logo_url', ev.target.result);
    };
    reader.readAsDataURL(file);
  }

  const canNext = data.name?.trim();
  return (
    <div>
      <h2 style={{ fontFamily: INTER, fontSize: 22, fontWeight: 700, color: TEXT, margin: '0 0 6px' }}>
        {s1.heading}
      </h2>
      <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: '0 0 28px' }}>
        {s1.sub}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ gridColumn: 'span 2' }}>
          <Label>{s1.nameLabel}</Label>
          <TextInput value={data.name} onChange={(e) => onChange('name', e.target.value)} placeholder={s1.namePlaceholder} />
        </div>

        <div>
          <Label>{s1.orgNrLabel}</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            <TextInput
              value={data.org_nr}
              onChange={(e) => onChange('org_nr', e.target.value)}
              placeholder="556789-0123"
            />
            <Btn onClick={handleLookup} disabled={looking || !data.org_nr?.trim()} small variant="ghost">
              {looking ? s1.fetching : s1.fetchBtn}
            </Btn>
          </div>
          <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED, marginTop: 4 }}>
            {s1.orgNrHint}
          </div>
        </div>

        <div>
          <Label>{s1.phoneLabel}</Label>
          <TextInput value={data.phone} onChange={(e) => onChange('phone', e.target.value)} placeholder="+46 8 123 456 78" />
        </div>

        <div style={{ gridColumn: 'span 2' }}>
          <Label>{s1.addressLabel}</Label>
          <TextInput value={data.address} onChange={(e) => onChange('address', e.target.value)} placeholder="Industrivägen 12, 117 43 Stockholm" />
        </div>

        <div style={{ gridColumn: 'span 2' }}>
          <Label>{s1.emailLabel}</Label>
          <TextInput type="email" value={data.email} onChange={(e) => onChange('email', e.target.value)} placeholder="info@svenssons.se" />
        </div>
      </div>

      {/* Logo upload */}
      <div style={{ marginBottom: 28 }}>
        <Label>{s1.logoLabel}</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {logoPreview ? (
            <img src={logoPreview} alt="logo" style={{ height: 48, objectFit: 'contain', borderRadius: 6, border: `1px solid ${BORDER}` }} />
          ) : (
            <div style={{
              width: 48, height: 48, background: BG, border: `2px dashed ${BORDER}`, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: INTER, fontSize: 20, color: MUTED,
            }}>
              Å
            </div>
          )}
          <label style={{ cursor: 'pointer' }}>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoFile} />
            <span style={{
              fontFamily: INTER, fontSize: 12, fontWeight: 500, color: BLUE,
              border: `1px solid ${BLUE}`, borderRadius: 6, padding: '5px 12px',
            }}>
              {s1.logoUpload}
            </span>
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={onNext} disabled={!canNext}>{s1.next}</Btn>
      </div>
    </div>
  );
}

// ── Step 2: Fleet ─────────────────────────────────────────────────────────────
function StepFleet({ trucks, onAdd, onRemove, onUpdate, onNext, onBack }) {
  const { t } = useLanguage();
  const s2 = t.onboarding.step2;

  function handleTogglePreset(preset) {
    const exists = trucks.find((tr) => tr.typ === preset.typ);
    if (exists) {
      onRemove(exists._key);
    } else {
      onAdd({
        _key:           Date.now(),
        typ:            preset.typ,
        lasttyp:        preset.lasttyp,
        namn:           `${preset.typ} 1`,
        reg:            '',
        timkostnad_sek: preset.timkostnad_sek,
        priskm_sek:     preset.priskm_sek,
        startavgift_sek:preset.startavgift_sek,
        max_last_kg:    preset.max_last_kg,
        volym_m3:       preset.volym_m3,
        lez_godkand:    preset.lez_godkand,
        euro_klass:     preset.euro_klass,
        beskrivning:    t.onboarding.fleetPresetDescs[FLEET_PRESETS.indexOf(preset)] ?? preset.typ,
      });
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily: INTER, fontSize: 22, fontWeight: 700, color: TEXT, margin: '0 0 6px' }}>
        {s2.heading}
      </h2>
      <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: '0 0 24px' }}>
        {s2.sub}
      </p>

      {/* Preset grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 24 }}>
        {FLEET_PRESETS.map((preset) => {
          const selected = trucks.some((tr) => tr.typ === preset.typ);
          return (
            <button
              key={preset.typ}
              onClick={() => handleTogglePreset(preset)}
              style={{
                fontFamily: INTER, textAlign: 'left', cursor: 'pointer',
                padding: '12px 14px', borderRadius: 10,
                border: `2px solid ${selected ? BLUE : BORDER}`,
                background: selected ? 'rgba(201,168,76,0.06)' : WHITE,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{preset.typ}</div>
              <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.4 }}>{t.onboarding.fleetPresetDescs[FLEET_PRESETS.indexOf(preset)]}</div>
              {selected && (
                <div style={{ marginTop: 6, fontSize: 11, color: BLUE, fontWeight: 600 }}>{s2.selectedMark}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected trucks — editable names/plates */}
      {trucks.length > 0 && (
        <div style={{
          background: SURF, border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: '14px 16px', marginBottom: 24,
        }}>
          <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {s2.selectedLabel(trucks.length)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {trucks.map((tr) => (
              <div key={tr._key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED, width: 90, flexShrink: 0 }}>
                  {tr.typ}
                </span>
                <TextInput
                  value={tr.namn}
                  onChange={(e) => onUpdate(tr._key, 'namn', e.target.value)}
                  placeholder={s2.namePlaceholder}
                />
                <TextInput
                  value={tr.reg}
                  onChange={(e) => onUpdate(tr._key, 'reg', e.target.value)}
                  placeholder="Reg.nr"
                />
                <Btn onClick={() => onRemove(tr._key)} variant="ghost" small>×</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {trucks.length === 0 && (
        <div style={{
          fontFamily: INTER, fontSize: 13, color: MUTED,
          textAlign: 'center', padding: '20px 0', marginBottom: 16,
        }}>
          {s2.emptyWarning}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Btn onClick={onBack} variant="ghost">{s2.back}</Btn>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={onNext} variant="ghost">{s2.skip}</Btn>
          <Btn onClick={onNext} disabled={trucks.length === 0}>{s2.next}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Pricing ───────────────────────────────────────────────────────────
function StepPricing({ pricing, onChange, onNext, onBack }) {
  const { t } = useLanguage();
  const s3 = t.onboarding.step3;
  return (
    <div>
      <h2 style={{ fontFamily: INTER, fontSize: 22, fontWeight: 700, color: TEXT, margin: '0 0 6px' }}>
        {s3.heading}
      </h2>
      <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: '0 0 28px', lineHeight: 1.6 }}>
        {s3.sub}
      </p>

      {/* How it works callout */}
      <div style={{
        background: 'rgba(201,168,76,0.05)', border: `1px solid rgba(201,168,76,0.2)`,
        borderRadius: 10, padding: '14px 18px', marginBottom: 28,
        display: 'flex', gap: 14,
      }}>
        <div style={{ fontFamily: INTER, fontSize: 12, color: TEXT, lineHeight: 1.7 }}>
          <strong>{s3.howItWorks}</strong><br />
          {s3.formula}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        <div>
          <Label>{s3.fuelCost}</Label>
          <TextInput
            type="number" value={pricing.fuel_cost_km}
            onChange={(e) => onChange('fuel_cost_km', parseFloat(e.target.value) || 0)}
            placeholder="2.50"
          />
          <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED, marginTop: 4 }}>
            {s3.fuelHint}
          </div>
        </div>

        <div>
          <Label>{s3.markup}</Label>
          <TextInput
            type="number" value={pricing.markup_pct}
            onChange={(e) => onChange('markup_pct', parseFloat(e.target.value) || 0)}
            placeholder="35"
          />
          <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED, marginTop: 4 }}>
            {s3.markupHint}
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div style={{
        background: SURF, border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: '14px 18px', marginBottom: 28,
      }}>
        <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          {s3.preview}
        </div>
        {(() => {
          const km = 50, h = 3, timkostnad = 750, start = 600;
          const base = km * 22 + h * timkostnad + start + km * (pricing.fuel_cost_km || 0);
          const total = Math.round(base * (1 + (pricing.markup_pct || 0) / 100));
          const el = s3.exampleLabels;
          return (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[
                { label: el.distance, value: `${km * 22} kr` },
                { label: el.labour,   value: `${h * timkostnad} kr` },
                { label: el.fuel,     value: `${Math.round(km * (pricing.fuel_cost_km || 0))} kr` },
                { label: el.start,    value: `${start} kr` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED }}>{label}</div>
                  <div style={{ fontFamily: INTER, fontSize: 13, color: TEXT, fontWeight: 500 }}>{value}</div>
                </div>
              ))}
              <div style={{ borderLeft: `1px solid ${BORDER}`, paddingLeft: 24 }}>
                <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED }}>{el.total(pricing.markup_pct || 0)}</div>
                <div style={{ fontFamily: INTER, fontSize: 18, color: BLUE, fontWeight: 700 }}>{new Intl.NumberFormat('sv-SE').format(total)} kr</div>
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Btn onClick={onBack} variant="ghost">{s3.back}</Btn>
        <Btn onClick={onNext}>{s3.next}</Btn>
      </div>
    </div>
  );
}

// ── Step 4: First customer ────────────────────────────────────────────────────
function StepCustomer({ customer, onChange, onNext, onBack, onSkip, saving }) {
  const { t } = useLanguage();
  const s4 = t.onboarding.step4;
  const canSave = customer.name?.trim();
  return (
    <div>
      <h2 style={{ fontFamily: INTER, fontSize: 22, fontWeight: 700, color: TEXT, margin: '0 0 6px' }}>
        {s4.heading}
      </h2>
      <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: '0 0 28px', lineHeight: 1.6 }}>
        {s4.sub}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
        <div>
          <Label>{s4.nameLabel}</Label>
          <TextInput
            value={customer.name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="Bergström Bygg AB"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Label>{s4.phoneLabel}</Label>
            <TextInput
              value={customer.phone}
              onChange={(e) => onChange('phone', e.target.value)}
              placeholder="+46701112233"
            />
          </div>
          <div>
            <Label>{s4.emailLabel}</Label>
            <TextInput
              type="email" value={customer.email}
              onChange={(e) => onChange('email', e.target.value)}
              placeholder="info@bergstrom.se"
            />
          </div>
        </div>
        <div>
          <Label>{s4.notesLabel}</Label>
          <textarea
            value={customer.notes ?? ''}
            onChange={(e) => onChange('notes', e.target.value)}
            placeholder={s4.notesPlaceholder}
            rows={2}
            style={{
              fontFamily: INTER, fontSize: 13, color: TEXT,
              border: `1.5px solid ${BORDER}`, borderRadius: 8,
              padding: '9px 12px', width: '100%', boxSizing: 'border-box',
              resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Btn onClick={onBack} variant="ghost">{s4.back}</Btn>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={onSkip} variant="ghost">{s4.skip}</Btn>
          <Btn onClick={onNext} disabled={!canSave || saving}>
            {saving ? s4.saving : s4.next}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Step 5: Demo quote ────────────────────────────────────────────────────────
function StepDemo({ onComplete, loadingComplete }) {
  const { t, lang } = useLanguage();
  const s5 = t.onboarding.step5;
  const [inquiry,   setInquiry]   = useState(t.onboarding.demoInquiry);
  const [streaming, setStreaming] = useState(false);
  const [rawText,   setRawText]   = useState('');
  const [done,      setDone]      = useState(false);
  const [confetti,  setConfetti]  = useState(false);
  const [parsed,    setParsed]    = useState(null);

  const runDemo = useCallback(async () => {
    if (streaming || !inquiry.trim()) return;
    setStreaming(true);
    setRawText('');
    setDone(false);
    setParsed(null);

    const token = localStorage.getItem('auth_token');
    try {
      const res = await fetch('/api/analyse', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ inquiry, lang }),
      });
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buffer   = '';
      let full     = '';
      while (true) {
        const { done: rdone, value } = await reader.read();
        if (rdone) break;
        buffer += dec.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const payload = part.slice(6);
          if (payload === '[DONE]') { setDone(true); break; }
          try {
            const evt = JSON.parse(payload);
            if (evt.delta) { full += evt.delta; setRawText(full); }
          } catch { /* ignore */ }
        }
      }
      try {
        const match = full.match(/\{[\s\S]*\}/);
        if (match) {
          const obj = JSON.parse(match[0]);
          const flat = {};
          for (const [k, v] of Object.entries(obj)) {
            flat[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
          }
          setParsed(flat);
        }
      } catch { /* ignore */ }
      setConfetti(true);
      setTimeout(() => setConfetti(false), 5000);
    } catch (err) {
      console.error(err);
    } finally {
      setStreaming(false);
    }
  }, [inquiry, streaming]);

  const fmtSEK = (n) => n == null ? '—' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr';

  return (
    <div>
      {confetti && <Confetti />}
      <h2 style={{ fontFamily: INTER, fontSize: 22, fontWeight: 700, color: TEXT, margin: '0 0 6px' }}>
        {s5.heading}
      </h2>
      <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: '0 0 24px', lineHeight: 1.6 }}>
        {s5.sub}
      </p>

      <textarea
        value={inquiry}
        onChange={(e) => setInquiry(e.target.value)}
        rows={4}
        disabled={streaming || done}
        style={{
          fontFamily: INTER, fontSize: 13, color: TEXT, width: '100%', boxSizing: 'border-box',
          border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px',
          resize: 'vertical', outline: 'none', marginBottom: 16,
          background: (streaming || done) ? SURF : WHITE,
        }}
      />

      {!done && (
        <Btn onClick={runDemo} disabled={streaming || !inquiry.trim()}>
          {streaming ? s5.generating : s5.generate}
        </Btn>
      )}

      {streaming && rawText && (
        <div style={{
          marginTop: 20, background: SURF, border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: '14px 16px', fontFamily: 'monospace', fontSize: 12, color: TEXT,
          whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto',
        }}>
          {rawText}
          <span style={{ animation: 'blink 1s step-start infinite' }}>▌</span>
        </div>
      )}

      {done && parsed && (
        <div style={{ marginTop: 24 }}>
          {/* Success banner */}
          <div style={{
            background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.35)',
            borderRadius: 10, padding: '14px 20px', marginBottom: 20,
            display: 'flex', gap: 12, alignItems: 'center',
          }}>
            <div>
              <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 700, color: '#1a7a47' }}>
                {s5.readyTitle}
              </div>
              <div style={{ fontFamily: INTER, fontSize: 12, color: '#1a7a47', marginTop: 2 }}>
                {s5.readyDesc}
              </div>
            </div>
          </div>

          {/* Quote summary */}
          <div style={{
            background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 10,
            overflow: 'hidden', marginBottom: 24,
          }}>
            <div style={{
              background: SURF, padding: '10px 18px', borderBottom: `1px solid ${BORDER}`,
              fontFamily: INTER, fontSize: 11, fontWeight: 600, color: MUTED,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {s5.summaryHeading}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
              {[
                { label: s5.fields.cargo,    value: parsed.lasttyp                ?? '—' },
                { label: s5.fields.pickup,   value: parsed.upphämtning            ?? '—' },
                { label: s5.fields.delivery, value: parsed.leverans               ?? '—' },
                { label: s5.fields.distance, value: parsed.avstand_km != null ? `${parsed.avstand_km} km` : '—' },
                { label: s5.fields.vehicle,  value: parsed.fordon_rekommenderat   ?? '—' },
                { label: s5.fields.total,    value: fmtSEK(parsed.totalpris_sek), highlight: true },
              ].map(({ label, value, highlight }) => (
                <div key={label} style={{ padding: '12px 18px', borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontFamily: INTER, fontSize: 11, color: MUTED, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? BLUE : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn onClick={onComplete} disabled={loadingComplete}>
              {loadingComplete ? s5.loadingDashboard : s5.finish}
            </Btn>
          </div>
        </div>
      )}

      {!done && !streaming && (
        <div style={{ marginTop: 16 }}>
          <Btn onClick={onComplete} disabled={loadingComplete} variant="ghost" small>
            {loadingComplete ? '…' : s5.skipDemo}
          </Btn>
        </div>
      )}
    </div>
  );
}

// ── Main Onboarding wizard ────────────────────────────────────────────────────
export function Onboarding({ onComplete }) {
  const { company, updateCompany } = useAuth();
  const { t } = useLanguage();
  const to = t.onboarding;
  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const [companyData, setCompanyData] = useState({
    name:    company?.name    ?? '',
    org_nr:  company?.org_nr  ?? '',
    address: company?.address ?? '',
    phone:   company?.phone   ?? '',
    email:   company?.email   ?? '',
    logo_url: company?.logo_url ?? null,
  });
  const [trucks,   setTrucks]   = useState([]);
  const [pricing,  setPricing]  = useState({ fuel_cost_km: 2.50, markup_pct: 35 });
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', notes: '' });

  function changeCompany(key, val)  { setCompanyData((p) => ({ ...p, [key]: val })); }
  function changePricing(key, val)  { setPricing((p) => ({ ...p, [key]: val })); }
  function changeCustomer(key, val) { setCustomer((p) => ({ ...p, [key]: val })); }

  function addTruck(tr)            { setTrucks((p) => [...p, tr]); }
  function removeTruck(key)        { setTrucks((p) => p.filter((tr) => tr._key !== key)); }
  function updateTruck(key, k, v)  { setTrucks((p) => p.map((tr) => tr._key === key ? { ...tr, [k]: v } : tr)); }

  async function saveStep1() {
    setSaving(true);
    try {
      const r = await apiFetch('/api/onboarding/company', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(companyData),
      });
      const updated = await r.json();
      updateCompany(updated);
    } catch { /* continue anyway */ } finally { setSaving(false); }
  }

  async function saveStep2() {
    if (trucks.length === 0) { setStep(2); return; }
    setSaving(true);
    try {
      await Promise.all(trucks.map((tr) => {
        const { _key, ...body } = tr;
        const extId = (tr.reg?.trim() || tr.namn?.trim()?.slice(0, 6).toUpperCase().replace(/\s/g, '') || 'V01');
        return apiFetch('/api/fleet', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ...body, ext_id: extId }),
        });
      }));
    } catch { /* continue */ } finally { setSaving(false); }
    setStep(2);
  }

  async function saveStep3() {
    setSaving(true);
    try {
      await apiFetch('/api/onboarding/save-pricing', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pricing_config: pricing }),
      });
    } catch { /* continue */ } finally { setSaving(false); }
    setStep(3);
  }

  async function saveStep4() {
    if (!customer.name?.trim()) { setStep(4); return; }
    setSaving(true);
    try {
      await apiFetch('/api/customers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          customer_name:  customer.name.trim(),
          customer_phone: customer.phone.trim() || null,
          customer_email: customer.email.trim() || null,
          notes:          customer.notes.trim() || null,
        }),
      });
    } catch { /* continue */ } finally { setSaving(false); }
    setStep(4);
  }

  async function handleComplete() {
    setLoadingDemo(true);
    try {
      const r   = await apiFetch('/api/onboarding/complete', { method: 'POST' });
      const upd = await r.json();
      updateCompany(upd);
      onComplete(upd);
    } catch { /* fallback */ } finally { setLoadingDemo(false); }
  }

  async function handleLoadDemoData() {
    if (!window.confirm(to.loadDemoConfirm)) return;
    setSaving(true);
    try {
      const r    = await apiFetch('/api/onboarding/load-demo-data', { method: 'POST' });
      const data = await r.json();
      if (data.company) {
        updateCompany(data.company);
        onComplete(data.company);
      }
    } catch (err) {
      alert(to.loadDemoError + ': ' + err.message);
    } finally { setSaving(false); }
  }

  async function handleNext0() {
    await saveStep1();
    setStep(1);
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        background: WHITE, borderBottom: `1px solid ${BORDER}`,
        padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LogoFull markSize={26} />
          <span style={{ fontFamily: INTER, fontSize: 12, color: MUTED, borderLeft: `1px solid ${BORDER}`, paddingLeft: 16 }}>{to.setup}</span>
        </div>
        <button
          onClick={handleLoadDemoData}
          disabled={saving}
          style={{
            fontFamily: INTER, fontSize: 12, fontWeight: 500, color: MUTED,
            background: SURF, border: `1px solid ${BORDER}`, borderRadius: 7,
            padding: '6px 14px', cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '…' : to.loadDemo}
        </button>
      </div>

      {/* Wizard card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px' }}>
        <div style={{
          background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 8,
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          width: '100%', maxWidth: 640, padding: '36px 40px',
        }}>
          <StepBar current={step} />

          {step === 0 && (
            <StepCompany
              data={companyData}
              onChange={changeCompany}
              onNext={handleNext0}
            />
          )}
          {step === 1 && (
            <StepFleet
              trucks={trucks}
              onAdd={addTruck}
              onRemove={removeTruck}
              onUpdate={updateTruck}
              onNext={saveStep2}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <StepPricing
              pricing={pricing}
              onChange={changePricing}
              onNext={saveStep3}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepCustomer
              customer={customer}
              onChange={changeCustomer}
              onNext={saveStep4}
              onBack={() => setStep(2)}
              onSkip={() => setStep(4)}
              saving={saving}
            />
          )}
          {step === 4 && (
            <StepDemo
              onComplete={handleComplete}
              loadingComplete={loadingDemo}
            />
          )}
        </div>
      </div>
    </div>
  );
}
