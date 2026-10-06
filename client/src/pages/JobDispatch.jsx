import { useState } from 'react';
import { AlertTriangle, QrCode, Send, UserPlus } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { AuthImage } from '../components/AuthImage.jsx';
import { LinkShare } from '../components/LinkShare.jsx';
import { TableSkeleton, ErrorNotice } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { navigate } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import {
  REVIEW_STATUS, SMS_STATUS, VEHICLE_TYPES, VEHICLE_ZONE_CLASSES, ZONE_CLASSES, formatDate, formatTon,
} from '../lib/labels.js';

const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(new Date());

/** Assign vehicle + driver per day and send the magic-link SMS. */
export function AssignmentsPanel({ job, onChanged }) {
  const toast = useToast();
  const assignments = useApi(`/api/jobs/${job.id}/assignments`);
  const vehicles = useApi('/api/vehicles');
  const drivers = useApi('/api/drivers');
  const active = job.status === 'bekraftad' || job.status === 'pagar';

  const defaultDate = job.datum_fran > todayLocal() ? job.datum_fran : todayLocal();
  const [form, setForm] = useState({ datum: defaultDate, vehicle_id: '', driver_id: '', send_sms: true });
  const [busy, setBusy] = useState(false);
  const [zoneWarning, setZoneWarning] = useState(null); // message
  const [shared, setShared] = useState(null); // { url, note, name } shown in a dialog
  const [error, setError] = useState(null);

  async function assign(acknowledge = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/api/jobs/${job.id}/assignments`, {
        method: 'POST',
        body: {
          datum: form.datum, vehicle_id: Number(form.vehicle_id), driver_id: Number(form.driver_id),
          send_sms: form.send_sms, ...(acknowledge ? { acknowledge_miljozon: true } : {}),
        },
      });
      setZoneWarning(null);
      setForm((f) => ({ ...f, vehicle_id: '', driver_id: '' }));
      res.warnings.forEach((w) => toast(w, 'warning'));
      if (res.sms?.status === 'skickat') {
        toast(`${res.assignment.driver_name} är tilldelad och har fått SMS`);
      } else if (res.sms) {
        // Simulated or failed SMS: show the link and QR code right away.
        setShared({ url: res.sms.link, note: smsNote(res.sms.status, res.assignment.driver_name), name: res.assignment.driver_name });
      } else {
        toast(`${res.assignment.driver_name} är tilldelad`);
      }
      assignments.reload();
      onChanged?.();
    } catch (err) {
      if (err.code === 'miljozon_warning') setZoneWarning(err.message);
      else setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function resend(a) {
    try {
      const res = await api(`/api/assignments/${a.id}/send-sms`, { method: 'POST' });
      if (res.status === 'skickat') toast(`Nytt SMS skickat till ${a.driver_name}`);
      else setShared({ url: res.link, note: smsNote(res.status, a.driver_name), name: a.driver_name });
      assignments.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function showQr(a) {
    try {
      const res = await api(`/api/assignments/${a.id}/link`, { method: 'POST' });
      setShared({ url: res.link, note: `Låt ${a.driver_name} skanna koden med mobilkameran. Inget SMS skickas.`, name: a.driver_name });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function cancel(a) {
    if (!window.confirm(`Avboka ${a.regnr} / ${a.driver_name} ${formatDate(a.datum)}?`)) return;
    try {
      await api(`/api/assignments/${a.id}/cancel`, { method: 'POST' });
      assignments.reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const ready = form.datum && form.vehicle_id && form.driver_id;
  const vehicle = vehicles.data?.find((v) => String(v.id) === form.vehicle_id);
  const zoneProblem = vehicle && job.miljozon > 0 && vehicle.miljozonsklass < job.miljozon;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="t-heading">Fordon och förare</h2>
        {job.miljozon > 0 && <span className="badge badge-blue">{ZONE_CLASSES[job.miljozon]}</span>}
      </div>

      {active && (
        <div className="panel-body" style={{ borderBottom: '1px solid var(--border)', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', alignItems: 'end' }}>
            <div className="field">
              <label className="field-label" htmlFor="as-date">Datum</label>
              <input id="as-date" type="date" className="input" value={form.datum} onChange={(e) => setForm((f) => ({ ...f, datum: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="as-vehicle">Fordon</label>
              <select id="as-vehicle" className="input" value={form.vehicle_id} onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}>
                <option value="">Välj…</option>
                {vehicles.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.regnr} · {VEHICLE_TYPES[v.typ]}{job.miljozon > 0 && v.miljozonsklass < job.miljozon ? ' · uppfyller ej miljözon' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="as-driver">Förare</label>
              <select id="as-driver" className="input" value={form.driver_id} onChange={(e) => setForm((f) => ({ ...f, driver_id: e.target.value }))}>
                <option value="">Välj…</option>
                {drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <Button onClick={() => assign(false)} loading={busy} disabled={!ready}>
              {form.send_sms ? <Send size={14} /> : <UserPlus size={14} />} {form.send_sms ? 'Tilldela och skicka SMS' : 'Tilldela'}
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="checkbox" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={form.send_sms} onChange={(e) => setForm((f) => ({ ...f, send_sms: e.target.checked }))} />
              Skicka SMS med länk till föraren
            </label>
            {zoneProblem && (
              <span className="badge badge-amber"><AlertTriangle size={12} /> {vehicle.regnr} uppfyller {VEHICLE_ZONE_CLASSES[vehicle.miljozonsklass].toLowerCase()}</span>
            )}
          </div>
          <ErrorNotice error={error} />
        </div>
      )}

      {assignments.loading && !assignments.data ? <TableSkeleton rows={2} /> : assignments.data?.length === 0 ? (
        <div className="empty">Inga fordon tilldelade än.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Datum</th><th>Fordon</th><th>Förare</th><th>SMS</th><th>Lass</th><th /></tr></thead>
            <tbody>
              {assignments.data?.map((a) => (
                <tr key={a.id} className={a.cancelled_at ? 'inactive' : ''}>
                  <td className="num">{formatDate(a.datum)}</td>
                  <td>
                    <span className="num" style={{ fontWeight: 600 }}>{a.regnr}</span>
                    {a.miljozon_warning === 1 && <span className="badge badge-amber" style={{ marginLeft: 6 }} title="Tilldelad trots att fordonet inte uppfyller miljözonen">Miljözon</span>}
                  </td>
                  <td>{a.driver_name}</td>
                  <td>{a.cancelled_at ? <span className="badge badge-muted">Avbokad</span> : <span className={`badge ${SMS_STATUS[a.sms_status].badge}`}>{SMS_STATUS[a.sms_status].label}</span>}</td>
                  <td className="num">{a.lass_count}{a.timmar != null && <span className="t-muted"> · {String(a.timmar).replace('.', ',')} h</span>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!a.cancelled_at && active && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => showQr(a)}><QrCode size={13} /> QR-kod</Button>{' '}
                        <Button size="sm" variant="ghost" onClick={() => resend(a)}>{a.sms_status === 'ej_skickat' ? 'Skicka SMS' : 'Skicka igen'}</Button>{' '}
                        {a.lass_count === 0 && <Button size="sm" variant="ghost" onClick={() => cancel(a)}>Avboka</Button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={Boolean(shared)}
        onClose={() => setShared(null)}
        title={shared ? `Förarlänk för ${shared.name}` : ''}
        footer={<Button onClick={() => setShared(null)}>Klar</Button>}
      >
        {shared && <LinkShare url={shared.url} note={shared.note} />}
      </Dialog>

      <Dialog
        open={Boolean(zoneWarning)}
        onClose={() => setZoneWarning(null)}
        title="Fordonet uppfyller inte miljözonen"
        description={zoneWarning}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setZoneWarning(null)}>Välj annat fordon</Button>
            <Button variant="danger" onClick={() => assign(true)} loading={busy}>Tilldela ändå</Button>
          </>
        )}
      >
        <p className="t-muted" style={{ fontSize: 13 }}>
          Åkaren kontrollerar bara fordonets angivna miljözonsklass mot projektets zon. Att tilldela ändå loggas.
        </p>
      </Dialog>
    </section>
  );
}

function smsNote(status, name) {
  if (status === 'simulerat') return `SMS:et simulerades (46elks är inte konfigurerat). Låt ${name} skanna QR-koden med mobilkameran, eller skicka länken på annat sätt.`;
  if (status === 'misslyckat') return `SMS:et till ${name} kunde inte skickas. Dela länken på annat sätt.`;
  return `SMS skickat till ${name}.`;
}

/** Lass reported on this job. A row opens the lass on the Granska lass page. */
export function LassPanel({ job }) {
  const { data, error, loading, reload } = useApi(`/api/jobs/${job.id}/lass`);
  const [photo, setPhoto] = useState(null);
  const totalKg = data?.reduce((s, l) => s + (l.netto_kg ?? 0), 0) ?? 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="t-heading">Lass</h2>
        {data?.length > 0 && <span className="t-muted num" style={{ fontSize: 13 }}>{data.length} lass · {formatTon(totalKg)}</span>}
      </div>
      <ErrorNotice error={error} onRetry={reload} />
      {loading && !data ? <TableSkeleton rows={3} /> : data?.length === 0 ? (
        <div className="empty">Inga lass rapporterade än. Föraren rapporterar via länken i SMS:et.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th /><th>Datum</th><th>Vågsedel</th><th>Netto</th><th>Material</th><th>Förare</th><th>Status</th></tr></thead>
            <tbody>
              {data?.map((l) => (
                <tr key={l.id} className="clickable" tabIndex={0}
                  onClick={() => navigate(`/lass/${l.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/lass/${l.id}`); }}>
                  <td style={{ width: 52 }}>
                    {l.photo_id ? (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setPhoto(l); }} style={{ border: 'none', padding: 0, background: 'none', cursor: 'zoom-in' }} aria-label="Visa vågsedel">
                        <AuthImage src={`/api/photos/${l.photo_id}`} alt="Vågsedel" style={{ width: 40, height: 40, borderRadius: 6 }} />
                      </button>
                    ) : <span className="t-muted" style={{ fontSize: 11 }}>Inget foto</span>}
                  </td>
                  <td className="num">{formatDate(l.datum)}{l.tid && <div className="t-muted" style={{ fontSize: 12 }}>{l.tid}</div>}</td>
                  <td className="num">{l.vagsedel_nr ?? <span className="t-muted">–</span>}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{formatTon(l.netto_kg) || <span className="t-muted">–</span>}</td>
                  <td>
                    {l.material ?? '–'}
                    {l.farligt_avfall && <span className="badge badge-red" style={{ marginLeft: 6 }}>Farligt avfall</span>}
                  </td>
                  <td>{l.driver_name ?? '–'}<div className="t-muted num" style={{ fontSize: 12 }}>{l.vehicle_regnr}</div></td>
                  <td>
                    <span className={`badge ${REVIEW_STATUS[l.review_status].badge}`} title={l.review_reasons.join(', ')}>{REVIEW_STATUS[l.review_status].label}</span>
                    {l.review_reasons.length > 0 && <div className="t-muted" style={{ fontSize: 11, marginTop: 2 }}>{l.review_reasons.join(' · ')}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={Boolean(photo)} onClose={() => setPhoto(null)} title={photo ? `Vågsedel ${photo.vagsedel_nr ?? ''}` : ''}>
        {photo && <AuthImage src={`/api/photos/${photo.photo_id}`} alt="Vågsedel" style={{ width: '100%', height: 'auto', objectFit: 'contain', borderRadius: 8 }} />}
      </Dialog>
    </section>
  );
}
