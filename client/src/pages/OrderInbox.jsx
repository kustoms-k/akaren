import { useState } from 'react';
import { FileText, Mail, MessageSquare, PenLine, Sparkles } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { navigate } from '../lib/router.js';
import { UPPDRAGSTYPER, formatDate, formatTimestamp } from '../lib/labels.js';

const PLACEHOLDER = `Klistra in mejlet, sms:et eller texten från PDF:en här.

Ex: "Hej! Kan ni köra bort schaktmassor från Kv. Rörstrand, Rörstrandsgatan 40, på tisdag från kl 7? Ca 12 lass. Mvh Petra, Norrbacka Mark"`;

const SAMPLE_ICONS = { mejl: Mail, sms: MessageSquare, pdf: FileText };

export function OrderInbox() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const drafts = useApi('/api/intake?status=utkast');
  const integrations = useApi('/api/settings/integrations');
  const aiReady = integrations.data?.ai?.configured;
  const demo = integrations.data?.ai?.demo;
  const samples = useApi(demo ? '/api/intake/demo-samples' : null);

  async function start(kind) {
    setBusy(kind);
    setError(null);
    try {
      const intake = kind === 'ai'
        ? await api('/api/intake/extract', { method: 'POST', body: { text } })
        : await api('/api/intake/manual', { method: 'POST', body: { text } });
      navigate(`/bestallning/${intake.id}`);
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Ny beställning"
        description="Klistra in beställningen så läser AI:n ut uppgifterna. Du granskar allt innan det blir ett uppdrag."
        actions={demo && <span className="badge badge-blue" title="AI-svaren är förinspelade för exempelbeställningarna">Demoläge</span>}
      />

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          {samples.data?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="t-muted" style={{ fontSize: 13, marginRight: 2 }}>Exempel:</span>
              {samples.data.map((s) => {
                const Icon = SAMPLE_ICONS[s.kind] ?? Mail;
                return (
                  <Button key={s.id} size="sm" variant={text === s.text ? 'primary' : 'secondary'}
                    onClick={() => { setText(s.text); setError(null); }} disabled={busy !== null}>
                    <Icon size={13} /> {s.label}
                  </Button>
                );
              })}
            </div>
          )}
          <textarea
            className="input"
            rows={10}
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Beställningstext"
            maxLength={20000}
            disabled={busy === 'ai'}
          />
          <ErrorNotice error={error} />
          {integrations.data && !aiReady && (
            <div className="notice notice-amber">
              AI-tolkning är inte aktiverad (ANTHROPIC_API_KEY saknas). Du kan fylla i beställningen manuellt.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={() => start('ai')} loading={busy === 'ai'} disabled={!aiReady || text.trim().length < 10 || busy !== null}>
              <Sparkles size={15} /> {busy === 'ai' ? 'Läser beställningen…' : 'Tolka beställning'}
            </Button>
            <Button variant="secondary" onClick={() => start('manual')} loading={busy === 'manual'} disabled={busy !== null}>
              <PenLine size={15} /> Fyll i manuellt
            </Button>
            {busy === 'ai' && <span className="t-muted" style={{ fontSize: 13 }}>Det tar oftast 5–20 sekunder.</span>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2 className="t-heading">Utkast att granska</h2></div>
        <ErrorNotice error={drafts.error} onRetry={drafts.reload} />
        {drafts.loading && !drafts.data ? <TableSkeleton rows={2} /> : drafts.data?.length === 0 ? (
          <div className="empty">Inga utkast. Nya beställningar hamnar här tills de är bekräftade.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Kund</th><th>Typ</th><th>Datum</th><th>Text</th><th>Inläst</th></tr></thead>
              <tbody>
                {drafts.data?.map((d) => (
                  <tr key={d.id} className="clickable" tabIndex={0}
                    onClick={() => navigate(`/bestallning/${d.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/bestallning/${d.id}`); }}>
                    <td style={{ fontWeight: 550 }}>{d.kund ?? <span className="t-muted">Okänd</span>}</td>
                    <td>{UPPDRAGSTYPER[d.uppdragstyp] ?? '–'}</td>
                    <td className="num">{formatDate(d.datum) || '–'}</td>
                    <td className="t-muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.snippet || 'Manuell'}</td>
                    <td className="t-muted num">{formatTimestamp(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
