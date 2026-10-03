import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { LogoMark } from '../assets/Logo.jsx';
import { cachedGet, driverApi, loadSession, setCurrentSession, startSession } from './driverApi.js';
import { subscribeOutbox, syncOutbox } from './outbox.js';
import { AssignmentView } from './AssignmentView.jsx';
import { ReportLass } from './ReportLass.jsx';
import { UPPDRAGSTYPER, formatDate } from '../lib/labels.js';
import { go } from './nav.js';

// ── Hash routing inside the driver page, so the phone's back button works ──
const subscribeHash = (fn) => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); };
const useHash = () => useSyncExternalStore(subscribeHash, () => window.location.hash);

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(new Date());
const tomorrowLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(new Date(Date.now() + 86_400_000));

export default function DriverApp() {
  const linkToken = window.location.pathname.split('/f/')[1]?.split('/')[0] || null;
  const [session, setSession] = useState({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = linkToken ? await startSession(linkToken) : loadSession();
        if (!s) throw Object.assign(new Error('Länken har gått ut eller är ogiltig. Be kontoret skicka en ny.'), { code: 'link_expired' });
        setCurrentSession(s);
        if (alive) setSession({ status: 'ready' });
      } catch (err) {
        if (alive) setSession({ status: 'error', message: err.message });
      }
    })();
    return () => { alive = false; };
  }, [linkToken]);

  if (session.status === 'loading') {
    return <div className="drv" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}><LogoMark size={36} /></div>;
  }
  if (session.status === 'error') {
    return (
      <div className="drv" style={{ paddingTop: 48 }}>
        <LogoMark size={32} />
        <h1 style={{ marginTop: 16 }}>Länken fungerar inte</h1>
        <p className="drv-meta" style={{ marginTop: 8 }}>{session.message}</p>
      </div>
    );
  }
  return <DriverHome />;
}

function DriverHome() {
  const hash = useHash();
  const online = useOnline();
  const [me, setMe] = useState(null);
  const [outbox, setOutbox] = useState([]);
  const [captured, setCaptured] = useState(null); // photo File chosen on the assignment page
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => { driverApi('/api/driver/me').then(setMe).catch(() => {}); }, []);
  useEffect(() => subscribeOutbox(setOutbox), []);

  // Retry queued lass: on start, when coverage returns, and every 30 s while something is waiting.
  const pending = outbox.filter((o) => !o.error).length;
  useEffect(() => {
    if (!online || pending === 0) return undefined;
    syncOutbox().then((n) => { if (n > 0) refresh(); });
    const t = setInterval(() => syncOutbox().then((n) => { if (n > 0) refresh(); }), 30_000);
    return () => clearInterval(t);
  }, [online, pending, refresh]);

  const route = hash.replace(/^#\/?/, '').split('/');
  let view;
  if (route[0] === 'uppdrag' && route[1] && route[2] === 'rapportera') {
    view = (
      <ReportLass
        assignmentId={Number(route[1])}
        photo={route[3] === 'manuell' ? null : captured}
        onDone={() => { setCaptured(null); refresh(); go(`/uppdrag/${route[1]}`); }}
      />
    );
  } else if (route[0] === 'uppdrag' && route[1]) {
    view = (
      <AssignmentView
        key={`${route[1]}-${refreshKey}`}
        assignmentId={Number(route[1])}
        outbox={outbox.filter((o) => o.assignment_id === Number(route[1]))}
        onCapture={(file) => { setCaptured(file); go(`/uppdrag/${route[1]}/rapportera`); }}
      />
    );
  } else {
    view = <AssignmentList key={refreshKey} />;
  }

  return (
    <div className="drv">
      <header className="drv-top">
        <div className="drv-row" style={{ minWidth: 0 }}>
          <LogoMark size={22} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>{me?.name ?? 'Förare'}</div>
            <div className="drv-meta" style={{ fontSize: 13, lineHeight: 1.2 }}>{me?.company_name}</div>
          </div>
        </div>
        {!online ? (
          <span className="drv-status wait"><CloudOff size={14} style={{ verticalAlign: '-2px' }} /> Ingen täckning</span>
        ) : pending > 0 ? (
          <button type="button" className="drv-status wait" style={{ border: 'none' }} onClick={() => syncOutbox().then(refresh)}>
            <RefreshCw size={14} style={{ verticalAlign: '-2px' }} /> {pending} väntar
          </button>
        ) : null}
      </header>
      {view}
    </div>
  );
}

function AssignmentList() {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    cachedGet('/api/driver/assignments')
      .then(({ data, stale }) => setState({ data, stale }))
      .catch((error) => setState({ error }));
  }, []);

  if (state.loading) return <div className="skeleton" style={{ height: 120, borderRadius: 14 }} />;
  if (state.error) return <div className="drv-banner err">{state.error.message}</div>;

  const today = todayLocal();
  const tomorrow = tomorrowLocal();
  const groups = new Map();
  for (const a of state.data) {
    const label = a.datum === today ? 'Idag' : a.datum === tomorrow ? 'Imorgon' : a.datum < today ? 'Igår' : formatDate(a.datum);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(a);
  }

  if (state.data.length === 0) {
    return <p className="drv-meta" style={{ marginTop: 24 }}>Du har inga uppdrag just nu.</p>;
  }
  return (
    <>
      {state.stale && <StaleNote />}
      {[...groups.entries()].map(([label, list]) => (
    <section key={label}>
      <h2>{label}</h2>
      {list.map((a) => (
        <button key={a.id} type="button" className="drv-card" onClick={() => go(`/uppdrag/${a.id}`)}>
          <div className="drv-row" style={{ justifyContent: 'space-between' }}>
            <span className="drv-big">{a.project_name}</span>
            {a.lass_count > 0 && <span className="drv-status ok">{a.lass_count} lass</span>}
          </div>
          <div className="drv-meta" style={{ marginTop: 4 }}>
            {[a.tid && `kl ${a.tid}`, UPPDRAGSTYPER[a.uppdragstyp], a.regnr].filter(Boolean).join(' · ')}
          </div>
          <div className="drv-meta">{[a.project_address, a.project_ort].filter(Boolean).join(', ')}</div>
        </button>
      ))}
    </section>
      ))}
    </>
  );
}

export function StaleNote() {
  return <div className="drv-banner warn">Ingen täckning. Visar senast sparade uppgifter.</div>;
}
