import { useState } from 'react';
import { FileDown, Scale, Sparkles } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.js';
import { navigate } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import { FOUND_KIND, formatDate, formatKr, formatTon } from '../lib/labels.js';
import { downloadFoundPdf } from '../lib/foundPdf.js';

function StatTile({ label, value, sub, tone }) {
  return (
    <div className="panel stat">
      <div className="t-label">{label}</div>
      <div className="stat-value num" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="t-muted" style={{ fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const KIND_BADGE = { lass: 'badge-green', vikt_upp: 'badge-green', vikt_ned: 'badge-muted' };

function Weight({ item }) {
  if (item.kind === 'lass') return <>{formatTon(item.netto_kg)}</>;
  return <>{formatTon(item.from_kg)} <span className="t-muted">→</span> {formatTon(item.to_kg)}</>;
}

function Value({ item }) {
  if (item.value_ore == null) return <span className="t-muted" title="Timpris, fast pris eller pris saknas">Inget pris</span>;
  if (item.kind === 'vikt_ned') return <span className="t-muted" title="Rättad före fakturan, inga extra pengar">–</span>;
  return <span style={{ color: 'var(--success)', fontWeight: 600 }}>{formatKr(item.value_ore)}</span>;
}

/**
 * Hittat av Lasskoll (/hittat): every load found on a facility's weighing list that was never logged, and every
 * weight corrected from one, with what it's worth. The PDF is the evidence for the pilot guarantee.
 */
export function Hittat() {
  const { company } = useAuth();
  const toast = useToast();
  const found = useApi('/api/avstamning/found');
  const [busy, setBusy] = useState(false);
  const t = found.data?.totals;
  const items = found.data?.items ?? [];

  async function pdf() {
    setBusy(true);
    try {
      await downloadFoundPdf({ found: found.data, company }, `hittat-av-lasskoll-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      toast('PDF:en kunde inte skapas. Försök igen.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Hittat av Lasskoll"
        description="Vägda lass som aldrig loggades, och vikter rättade mot vågen. Pengar som annars inte hade fakturerats."
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/avstamning')}><Scale size={15} /> Avstämning</Button>
            <Button onClick={pdf} disabled={!items.length || busy}><FileDown size={15} /> {busy ? 'Skapar…' : 'Ladda ner rapport'}</Button>
          </>
        )}
      />
      <ErrorNotice error={found.error} onRetry={found.reload} />

      {t && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <StatTile label="Hittat totalt" value={formatKr(t.value_ore, { round: true })} tone={t.value_ore ? 'var(--success)' : undefined}
            sub={t.first_found_at ? `Sedan ${formatDate(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(t.first_found_at)))}` : 'Inget hittat än'} />
          <StatTile label="Denna månad" value={formatKr(t.month_value_ore, { round: true })} />
          <StatTile label="Lass som saknades" value={t.lass} sub={t.lass ? formatKr(t.lass_value_ore, { round: true }) : 'Vägda men aldrig loggade'} />
          <StatTile label="Vikter rättade" value={t.weight_up + t.weight_down}
            sub={t.weight_up || t.weight_down
              ? [t.weight_up && `${t.weight_up} uppåt, ${formatKr(t.weight_up_value_ore, { round: true })}`, t.weight_down && `${t.weight_down} nedåt`].filter(Boolean).join(' · ')
              : 'Mot mottagarens våg'} />
        </div>
      )}

      <section className="panel">
        {found.loading && !found.data ? <TableSkeleton /> : items.length === 0 ? (
          <div className="empty" style={{ display: 'grid', justifyItems: 'center', gap: 10, maxWidth: 520, margin: '0 auto' }}>
            <Sparkles size={28} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Inget hittat än</div>
            <p style={{ fontSize: 13 }}>
              Importera mottagarnas våglistor i Avstämning. När du skapar ett lass för en vägning som aldrig loggades,
              eller rättar en vikt mot vågen, räknas värdet in här.
            </p>
            <Button onClick={() => navigate('/avstamning')}><Scale size={15} /> Till avstämningen</Button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Hittat</th><th>Vad</th><th>Lass</th><th>Kund / projekt</th><th>Mottagare</th>
                  <th style={{ textAlign: 'right' }}>Vikt</th><th style={{ textAlign: 'right' }}>Värde</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={`${i.kind}-${i.lass_id}-${i.found_at}`} className="clickable" tabIndex={0}
                    onClick={() => navigate(`/lass/${i.lass_id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/lass/${i.lass_id}`); }}>
                    <td className="num">{formatDate(i.found_date)}</td>
                    <td>
                      <span className={`badge ${KIND_BADGE[i.kind]}`}>{FOUND_KIND[i.kind]}</span>
                      {i.invoiced && <div className="t-muted" style={{ fontSize: 12, marginTop: 2 }}>Fakturerat</div>}
                    </td>
                    <td className="num">{i.vagsedel_nr ?? `#${i.lass_id}`}<div className="t-muted" style={{ fontSize: 12 }}>{formatDate(i.datum)}</div></td>
                    <td>{i.customer_name}<div className="t-muted" style={{ fontSize: 12 }}>{i.project_name}</div></td>
                    <td>{i.facility_name}</td>
                    <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><Weight item={i} /></td>
                    <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><Value item={i} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {t?.unpriced > 0 && (
        <p className="t-muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          {t.unpriced} fynd har inget pris (timpris, fast pris eller pris saknas) och räknas inte in i summan.
        </p>
      )}
    </>
  );
}
