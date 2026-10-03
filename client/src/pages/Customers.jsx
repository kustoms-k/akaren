import { useDeferredValue, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { useToast } from '../lib/toast.js';
import { useApi } from '../lib/useApi.js';
import { navigate } from '../lib/router.js';
import { VAT_MODES } from '../lib/labels.js';
import { CustomerDialog } from './CustomerDialogs.jsx';

export function Customers() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const deferredQ = useDeferredValue(q.trim());
  const params = new URLSearchParams({ ...(deferredQ ? { q: deferredQ } : {}), ...(showInactive ? { all: '1' } : {}) });
  const { data, error, loading, reload } = useApi(`/api/customers?${params}`);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Kunder & projekt"
        description="Kunderna och deras arbetsplatser. Beställningar och lass kopplas hit."
        actions={<Button onClick={() => setCreating(true)}><Plus size={15} /> Ny kund</Button>}
      />
      <ErrorNotice error={error} onRetry={reload} />

      <section className="panel">
        <div className="panel-head">
          <div className="search">
            <Search size={15} />
            <input className="input" placeholder="Sök namn eller org.nr" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök kund" />
          </div>
          <label className="checkbox t-muted" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Visa inaktiva
          </label>
        </div>
        {loading && !data ? <TableSkeleton /> : data?.length === 0 ? (
          <div className="empty">{deferredQ ? 'Ingen kund matchar sökningen.' : 'Inga kunder än. Lägg till den första.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Kund</th><th>Org.nr</th><th>Ort</th><th>Projekt</th><th>Moms</th><th>Fortnox</th></tr>
              </thead>
              <tbody>
                {data?.map((c) => (
                  <tr
                    key={c.id}
                    className={`clickable${c.active ? '' : ' inactive'}`}
                    onClick={() => navigate(`/kunder/${c.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/kunder/${c.id}`); }}
                    tabIndex={0}
                  >
                    <td style={{ fontWeight: 550 }}>{c.name}{!c.active && <span className="badge badge-muted" style={{ marginLeft: 8 }}>Inaktiv</span>}</td>
                    <td className="num">{c.org_nr ?? '–'}</td>
                    <td>{c.ort ?? '–'}</td>
                    <td className="num">{c.project_count}</td>
                    <td>{c.vat_mode ? VAT_MODES[c.vat_mode] : <span className="t-muted">Standard</span>}</td>
                    <td>{c.fortnox_customer_nr ? <span className="num">#{c.fortnox_customer_nr}</span> : <span className="t-muted">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CustomerDialog
        open={creating}
        customer={null}
        onClose={() => setCreating(false)}
        onSaved={(c) => {
          setCreating(false);
          toast(`${c.name} har lagts till`);
          navigate(`/kunder/${c.id}`);
        }}
      />
    </>
  );
}
