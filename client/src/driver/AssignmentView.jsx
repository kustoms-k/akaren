import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, MapPin, Phone, PenLine } from 'lucide-react';
import { cachedGet, driverApi } from './driverApi.js';
import { discardOutboxItem } from './outbox.js';
import { go } from './nav.js';
import { UPPDRAGSTYPER, formatPhone, formatTon } from '../lib/labels.js';

const HOURLY = new Set(['kran', 'maskintransport', 'ovrigt', 'container']);

const STATUS = {
  ok: ['ok', 'Skickat'],
  behover_granskas: ['done', 'Skickat · kontoret kollar'],
  granskad: ['done', 'Godkänt'],
};

export function AssignmentView({ assignmentId, outbox, onCapture }) {
  const [state, setState] = useState({ loading: true });
  const [editing, setEditing] = useState(null);
  const fileInput = useRef(null);

  const load = () => cachedGet(`/api/driver/assignments/${assignmentId}`)
    .then(({ data, stale }) => setState({ data, stale }))
    .catch((error) => setState({ error }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [assignmentId]);

  if (state.loading) return <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />;
  if (state.error) return <><BackLink /><div className="drv-banner err">{state.error.message}</div></>;
  const a = state.data;
  const address = [a.project_address, a.project_ort].filter(Boolean).join(', ');

  return (
    <>
      <BackLink />
      {state.stale && <div className="drv-banner warn">Ingen täckning. Visar senast sparade uppgifter.</div>}
      <h1>{a.project_name}</h1>
      <p className="drv-meta">{a.customer_name}</p>

      <div className="drv-card" style={{ marginTop: 12 }}>
        <div className="drv-big">{UPPDRAGSTYPER[a.uppdragstyp]}{a.material ? ` · ${a.material}` : ''}</div>
        <div className="drv-meta" style={{ marginTop: 4 }}>{[a.tid && `Start kl ${a.tid}`, `Fordon ${a.regnr}`, a.antal_lass && `${a.antal_lass} lass beställda`].filter(Boolean).join(' · ')}</div>
        {(a.fran_text || a.till_text) && (
          <div style={{ marginTop: 10 }}>
            {a.fran_text && <div><span className="drv-meta">Från:</span> {a.fran_text}</div>}
            {a.till_text && <div><span className="drv-meta">Till:</span> {a.till_text}</div>}
          </div>
        )}
        {a.instruktioner && <div className="drv-banner info" style={{ margin: '12px 0 0' }}>{a.instruktioner}</div>}
        <div className="drv-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {address && (
            <a className="drv-btn secondary small" style={{ flex: 1 }} href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">
              <MapPin size={18} /> Karta
            </a>
          )}
          {a.telefon && (
            <a className="drv-btn secondary small" style={{ flex: 1 }} href={`tel:${a.telefon}`}>
              <Phone size={18} /> {a.kontaktperson ? a.kontaktperson.split(' ')[0] : formatPhone(a.telefon)}
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, margin: '16px 0' }}>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCapture(f); }}
        />
        <button type="button" className="drv-btn" onClick={() => fileInput.current?.click()}>
          <Camera size={24} /> Fotografera vågsedel
        </button>
        <button type="button" className="drv-btn secondary small" onClick={() => go(`/uppdrag/${a.id}/rapportera/manuell`)}>
          <PenLine size={18} /> Rapportera utan foto
        </button>
      </div>

      {HOURLY.has(a.uppdragstyp) && <Hours assignment={a} onSaved={load} />}

      <h2>Lass {a.lass.length + outbox.length > 0 ? `(${a.lass.length + outbox.length})` : ''}</h2>
      {outbox.map((o) => (
        <div key={`o${o.id}`} className="drv-card">
          <div className="drv-row" style={{ justifyContent: 'space-between' }}>
            <span className="drv-big">{formatTon(o.fields.netto_kg) || 'Lass'}</span>
            <span className={`drv-status ${o.error ? 'err' : 'wait'}`}>{o.error ? 'Kunde inte skickas' : 'Väntar på täckning'}</span>
          </div>
          <div className="drv-meta">{[o.fields.vagsedel_nr && `Vågsedel ${o.fields.vagsedel_nr}`, o.fields.tid].filter(Boolean).join(' · ')}</div>
          {o.error && (
            <>
              <div className="drv-hint" style={{ marginTop: 6 }}>{o.error}</div>
              <button type="button" className="drv-btn secondary small" style={{ marginTop: 8 }} onClick={() => discardOutboxItem(o.id)}>Ta bort och rapportera igen</button>
            </>
          )}
        </div>
      ))}
      {a.lass.length === 0 && outbox.length === 0 && <p className="drv-meta">Inga lass rapporterade än.</p>}
      {a.lass.map((l) => {
        const [cls, label] = STATUS[l.review_status];
        return (
          <button key={l.id} type="button" className="drv-card" onClick={() => l.review_status !== 'granskad' && setEditing(l)}>
            <div className="drv-row" style={{ justifyContent: 'space-between' }}>
              <span className="drv-big">{formatTon(l.netto_kg) || 'Vikt saknas'}</span>
              <span className={`drv-status ${cls}`}>{label}</span>
            </div>
            <div className="drv-meta">{[l.tid, l.vagsedel_nr && `Vågsedel ${l.vagsedel_nr}`, l.material].filter(Boolean).join(' · ')}</div>
          </button>
        );
      })}

      {editing && <CorrectLass lass={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function BackLink() {
  return (
    <button type="button" onClick={() => go('/')} className="drv-meta" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: 'none', border: 'none', padding: '4px 0 10px', font: 'inherit' }}>
      <ArrowLeft size={18} /> Mina uppdrag
    </button>
  );
}

function Hours({ assignment, onSaved }) {
  const [timmar, setTimmar] = useState(assignment.timmar ?? 8);
  const [state, setState] = useState(null);
  async function save() {
    setState('saving');
    try {
      await driverApi(`/api/driver/assignments/${assignment.id}/hours`, { method: 'POST', body: { timmar } });
      setState('saved');
      onSaved();
    } catch (err) {
      setState(err.message);
    }
  }
  return (
    <div className="drv-card">
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Arbetade timmar idag</div>
      <div className="drv-stepper">
        <button type="button" className="drv-btn secondary" onClick={() => setTimmar((t) => Math.max(0, t - 0.5))} aria-label="Minska">−</button>
        <div className="value num">{String(timmar).replace('.', ',')} h</div>
        <button type="button" className="drv-btn secondary" onClick={() => setTimmar((t) => Math.min(24, t + 0.5))} aria-label="Öka">+</button>
      </div>
      <button type="button" className="drv-btn small" style={{ marginTop: 10 }} onClick={save} disabled={state === 'saving'}>
        {state === 'saved' ? 'Sparat ✓' : 'Spara timmar'}
      </button>
      {state && !['saving', 'saved'].includes(state) && <div className="drv-hint" style={{ marginTop: 6 }}>{state}</div>}
    </div>
  );
}

const toTon = (kg) => (kg == null ? '' : String(kg / 1000).replace('.', ','));
const toKg = (ton) => {
  const n = Number(String(ton).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : null;
};

function CorrectLass({ lass, onClose, onSaved }) {
  const [netto, setNetto] = useState(toTon(lass.netto_kg));
  const [nr, setNr] = useState(lass.vagsedel_nr ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await driverApi(`/api/driver/lass/${lass.id}/versions`, { method: 'POST', body: { fields: { netto_kg: toKg(netto), vagsedel_nr: nr || null } } });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <div className="drv-card" style={{ borderColor: 'var(--accent)' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Rätta lasset</div>
      <div className="drv-field">
        <label htmlFor="c-netto">Nettovikt (ton)</label>
        <input id="c-netto" className="drv-input num" inputMode="decimal" value={netto} onChange={(e) => setNetto(e.target.value)} />
      </div>
      <div className="drv-field">
        <label htmlFor="c-nr">Vågsedelnummer</label>
        <input id="c-nr" className="drv-input" value={nr} onChange={(e) => setNr(e.target.value)} />
      </div>
      {error && <div className="drv-banner err">{error}</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        <button type="button" className="drv-btn" onClick={save} disabled={busy}>Spara rättelse</button>
        <button type="button" className="drv-btn secondary small" onClick={onClose}>Avbryt</button>
      </div>
    </div>
  );
}
