import { useState } from 'react';
import { ChevronDown, Presentation, QrCode, RotateCcw } from 'lucide-react';
import { Button } from './Button.jsx';
import { Dialog } from './Dialog.jsx';
import { Link } from './Link.jsx';
import { LinkShare } from './LinkShare.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.js';
import { workChanged } from '../lib/workCounts.js';

// The story of a prospect demo, in the order it's told: an order arrives, a truck is booked, the driver logs a load
// on their phone, the office reviews it, the weighing list catches what was missed, Friday's invoices go out, and
// the same check is offered on the prospect's own files. Only shown with DEMO_MODE.

const STEPS = [
  { key: 'oversikt', to: '/', title: 'Översikt', text: 'Det här ser kontoret på morgonen: allt som väntar, i ordning, och var varje bil är idag.' },
  { key: 'inkorg', to: '/inkorg', title: 'En beställning kommer in', text: 'Öppna Oskars mejl om förorenade massor. AI:n har läst ordern och flaggat farligt avfall. Skapa uppdraget och svara med orderbekräftelsen.' },
  { key: 'uppdrag', to: '/uppdrag?visa=idag', title: 'Boka bil', text: 'Öppna ett uppdrag, gärna ett som saknar bil idag, och boka "Resten av uppdraget". Ett SMS täcker alla dagarna.' },
  { key: 'forare', driver: true, title: 'Förarens mobil', text: 'Låt kunden skanna QR-koden: så ser föraren dagen och fotar vågsedeln. Ingen app, inget konto.' },
  { key: 'granska', to: '/lass', title: 'Granska lass', text: 'Börja granska. Jämför med fotot och godkänn med ⌘↵, nästa lass öppnas direkt.' },
  { key: 'avstamning', to: '/avstamning', title: 'Avstämning', text: 'Ekbackas våglista: tre lass som aldrig loggades och en vikt som skiljer. Skapa lassen och rätta vikten, och visa sedan Hittat av Lasskoll.' },
  { key: 'faktura', to: '/faktura', title: 'Fredag', text: 'Förra veckans underlag är klart. Ladda ner PDF med vågsedlar: ett foto bakom varje rad. Förhandsgranska utkastet till Fortnox.' },
  { key: 'forlust', to: '/forlustkontroll', title: 'Erbjud förlustkontrollen', text: 'Ladda exemplet och visa PDF:en. Erbjud samma kontroll gratis på deras egna filer.' },
];

const STORE = 'akaren_demo_guide';
const load = () => {
  try { return JSON.parse(localStorage.getItem(STORE)) ?? { open: true, done: [] }; } catch { return { open: true, done: [] }; }
};
const save = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* private mode */ } };

export function DemoGuide() {
  const toast = useToast();
  const [state, setState] = useState(load);
  const [driver, setDriver] = useState(null);       // { url, name }
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(null);
  const update = (next) => setState((s) => { const v = { ...s, ...next(s) }; save(v); return v; });
  const toggleDone = (key) => update((s) => ({ done: s.done.includes(key) ? s.done.filter((k) => k !== key) : [...s.done, key] }));

  // A link for today's busiest driver, shown as a QR code: the prospect opens the driver page on their own phone.
  async function openDriver() {
    setBusy('driver');
    try {
      const board = await api('/api/board');
      const a = board.vehicles.flatMap((v) => v.assignments.map((x) => ({ ...x, regnr: v.regnr })))
        .sort((x, y) => y.lass_count - x.lass_count)[0];
      if (!a) throw new Error('Ingen förare har en tilldelning idag. Boka en bil på ett uppdrag först.');
      const res = await api(`/api/assignments/${a.id}/link`, { method: 'POST' });
      setDriver({ url: res.link, name: a.driver_name, regnr: a.regnr });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy('reset');
    try {
      await api('/api/demo/reset', { method: 'POST', body: { confirm: 'ÅTERSTÄLL' } });
      save({ open: true, done: [] });
      workChanged();
      window.location.assign('/');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(null);
      setConfirmReset(false);
    }
  }

  const doneCount = state.done.length;
  return (
    <section className="panel demo-guide" style={{ marginBottom: 16 }}>
      <button type="button" className="demo-guide-head" aria-expanded={state.open} onClick={() => update((s) => ({ open: !s.open }))}>
        <Presentation size={16} />
        <span style={{ fontWeight: 600 }}>Demo-guide</span>
        <span className="t-muted" style={{ fontSize: 13 }}>{doneCount} av {STEPS.length} visade</span>
        <ChevronDown size={16} style={{ marginLeft: 'auto', transform: state.open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms var(--ease-out)' }} />
      </button>
      {state.open && (
        <>
          <ol className="demo-steps">
            {STEPS.map((s, i) => {
              const done = state.done.includes(s.key);
              return (
                <li key={s.key} className={done ? 'done' : ''}>
                  <button type="button" className="demo-check" aria-pressed={done} aria-label={done ? `Markera ${s.title} som inte visad` : `Markera ${s.title} som visad`} onClick={() => toggleDone(s.key)}>
                    {done ? '✓' : i + 1}
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>
                      {s.driver ? s.title : <Link to={s.to} onClick={() => !done && toggleDone(s.key)}>{s.title}</Link>}
                    </div>
                    <div className="t-muted" style={{ fontSize: 13 }}>{s.text}</div>
                    {s.driver && (
                      <Button size="sm" variant="secondary" style={{ marginTop: 6 }} loading={busy === 'driver'}
                        onClick={() => { openDriver(); if (!done) toggleDone(s.key); }}>
                        <QrCode size={13} /> Visa QR-kod
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="demo-guide-foot">
            <span className="t-muted" style={{ fontSize: 12.5 }}>Demodata med påhittade företag. Återställ före varje möte så stämmer datumen och siffrorna.</span>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}><RotateCcw size={13} /> Återställ demodata</Button>
          </div>
        </>
      )}

      <Dialog open={Boolean(driver)} onClose={() => setDriver(null)} title={driver ? `Förarvyn: ${driver.name}, ${driver.regnr}` : ''}
        footer={<Button onClick={() => setDriver(null)}>Klar</Button>}>
        {driver && (
          <LinkShare url={driver.url} note={/^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(driver.url)
            ? 'Skanna med mobilkameran. Mobilen måste vara på samma wifi som datorn.'
            : 'Skanna med mobilkameran. Länken fungerar på vilken mobil som helst.'} />
        )}
      </Dialog>
      <Dialog
        open={confirmReset} onClose={() => setConfirmReset(false)}
        title="Återställa demodata?"
        description="Allt i databasen raderas och ersätts med ny demodata daterad kring idag: uppdrag, lass, inkorg och våglistor. Det tar några sekunder."
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Avbryt</Button>
            <Button variant="danger" onClick={reset} loading={busy === 'reset'}><RotateCcw size={14} /> Återställ</Button>
          </>
        )}
      />
    </section>
  );
}
