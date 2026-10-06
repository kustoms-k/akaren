import { useDeferredValue, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { AuthImage } from '../components/AuthImage.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { useApi } from '../lib/useApi.js';
import { navigate, useLocation } from '../lib/router.js';
import { HAZARD_STATE, REVIEW_STATUS, formatDate, formatTon } from '../lib/labels.js';

const TABS = [
  ['granska', 'Att granska'],
  ['farligt', 'Farligt avfall'],
  ['alla', 'Alla lass'],
];

function LassTable({ rows, empty }) {
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th /><th>Datum</th><th>Kund / projekt</th><th>Vågsedel</th><th>Netto</th><th>Material</th><th>Fordon</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="clickable" tabIndex={0}
              onClick={() => navigate(`/lass/${l.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/lass/${l.id}`); }}>
              <td style={{ width: 52 }}>
                {l.photo_id
                  ? <AuthImage src={`/api/photos/${l.photo_id}`} alt="" style={{ width: 40, height: 40, borderRadius: 6 }} />
                  : <span className="t-muted" style={{ fontSize: 11 }}>Inget foto</span>}
              </td>
              <td className="num">{formatDate(l.datum)}{l.tid && <div className="t-muted" style={{ fontSize: 12 }}>{l.tid}</div>}</td>
              <td>
                <div style={{ fontWeight: 550 }}>{l.customer_name}</div>
                <div className="t-muted" style={{ fontSize: 12 }}>{l.project_name}</div>
              </td>
              <td className="num">{l.vagsedel_nr ?? <span className="t-muted">–</span>}</td>
              <td className="num" style={{ fontWeight: 600 }}>{formatTon(l.netto_kg) || <span className="t-muted">–</span>}</td>
              <td>
                {l.material ?? '–'}
                {l.farligt_avfall && <span className="badge badge-red" style={{ marginLeft: 6 }}>Farligt avfall</span>}
              </td>
              <td>
                <span className="num">{l.vehicle_regnr ?? '–'}</span>
                {l.driver_name && <div className="t-muted" style={{ fontSize: 12 }}>{l.driver_name}</div>}
              </td>
              <td>
                <span className={`badge ${REVIEW_STATUS[l.review_status].badge}`}>{REVIEW_STATUS[l.review_status].label}</span>
                {l.review_status === 'behover_granskas' && l.review_reasons.length > 0 && (
                  <div className="t-muted" style={{ fontSize: 11, marginTop: 2 }}>{l.review_reasons.join(' · ')}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HazardTable({ rows }) {
  if (rows.length === 0) return <div className="empty">Inget farligt avfall att rapportera.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Transport</th><th>Kund / projekt</th><th>Vågsedel</th><th>Avfallskod</th><th>Netto</th><th>Mottagare</th><th>Rapportera senast</th></tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id} className="clickable" tabIndex={0}
              onClick={() => navigate(`/lass/${h.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/lass/${h.id}`); }}>
              <td className="num">{formatDate(h.datum)}{h.tid && <div className="t-muted" style={{ fontSize: 12 }}>{h.tid}</div>}</td>
              <td>
                <div style={{ fontWeight: 550 }}>{h.customer_name}</div>
                <div className="t-muted" style={{ fontSize: 12 }}>{h.project_name}</div>
              </td>
              <td className="num">{h.vagsedel_nr ?? '–'}</td>
              <td className="num">{h.avfallskod ?? <span className="badge badge-amber">Saknas</span>}</td>
              <td className="num">{formatTon(h.netto_kg) || '–'}</td>
              <td>{h.till_namn ?? '–'}</td>
              <td>
                <div className="num">{formatDate(h.deadline)}</div>
                <span className={`badge ${HAZARD_STATE[h.state].badge}`}>
                  {h.state === 'rapporterad' ? `Rapporterad ${formatDate(h.reported_on)}` : HAZARD_STATE[h.state].label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LassQueue() {
  const { query } = useLocation();
  const tab = TABS.some(([k]) => k === query.get('flik')) ? query.get('flik') : 'granska';
  const [q, setQ] = useState('');
  const [showReported, setShowReported] = useState(false);
  const search = useDeferredValue(q.trim());

  const listPath = tab === 'granska' ? '/api/lass?review=behover_granskas'
    : tab === 'alla' ? `/api/lass${search ? `?q=${encodeURIComponent(search)}` : ''}` : null;
  const list = useApi(listPath);
  const hazards = useApi(tab === 'farligt' ? `/api/lass/farligt-avfall${showReported ? '?all=1' : ''}` : null);
  const summary = useApi('/api/lass/summary');
  const current = tab === 'farligt' ? hazards : list;

  const tabLabel = (key, label) => {
    const n = key === 'granska' ? summary.data?.to_review : key === 'farligt' ? summary.data?.hazard_unreported : null;
    return n ? `${label} (${n})` : label;
  };

  return (
    <>
      <PageHeader
        title="Granska lass"
        description="Lass med osäkra eller saknade uppgifter kontrolleras här innan de kan faktureras."
      />
      <ErrorNotice error={current.error ?? summary.error} onRetry={() => { current.reload(); summary.reload(); }} />

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Välj lista">
            {TABS.map(([key, label]) => (
              <Button key={key} size="sm" variant={tab === key ? 'primary' : 'ghost'} role="tab" aria-selected={tab === key}
                onClick={() => navigate(key === 'granska' ? '/lass' : `/lass?flik=${key}`, { replace: true })}>
                {tabLabel(key, label)}
              </Button>
            ))}
          </div>
          {tab === 'alla' && (
            <div className="search">
              <Search size={15} />
              <input className="input" placeholder="Sök vågsedel eller regnr" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök lass" />
            </div>
          )}
          {tab === 'farligt' && (
            <label className="checkbox t-muted" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={showReported} onChange={(e) => setShowReported(e.target.checked)} />
              Visa rapporterade
            </label>
          )}
        </div>
        {tab === 'farligt' && (
          <p className="t-muted" style={{ fontSize: 12, padding: '10px 18px 0' }}>
            Transporter av farligt avfall ska rapporteras till Naturvårdsverkets avfallsregister senast två arbetsdagar efter transporten.
          </p>
        )}
        {current.loading && !current.data ? <TableSkeleton /> : !current.data ? null : tab === 'farligt' ? (
          <HazardTable rows={current.data} />
        ) : (
          <LassTable
            rows={current.data}
            empty={tab === 'granska' ? 'Allt är granskat. Nya lass som behöver kontrolleras hamnar här.' : search ? 'Inga lass matchar sökningen.' : 'Inga lass rapporterade än.'}
          />
        )}
      </section>
    </>
  );
}
