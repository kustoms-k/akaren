import { useCallback, useDeferredValue, useState } from 'react';
import { CornerUpLeft, Inbox as InboxIcon, Mail, Paperclip, RefreshCw, Search, Server, Sparkles } from 'lucide-react';
import { Button } from '../components/Button.jsx';
import { Link } from '../components/Link.jsx';
import { PageHeader, ErrorNotice, TableSkeleton } from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useLocation } from '../lib/router.js';
import { useToast } from '../lib/toast.js';
import { INBOX_CATEGORY, formatAgo, formatMailTime } from '../lib/labels.js';
import { inboxChanged } from '../lib/inboxEvents.js';
import { InboxThread } from './InboxThread.jsx';

const TABS = [
  ['att_hantera', 'Att hantera'],
  ['order', 'Alla order'],
  ['bortsorterat', 'Sorterat bort'],
];

const withTab = (path, tab) => (tab === 'att_hantera' ? path : `${path}?flik=${tab}`);

function ThreadRow({ t, active, arrived, tab }) {
  const cat = t.order ? INBOX_CATEGORY[t.category] : null;
  const line = !t.order ? t.filter_reason : t.status === 'ny' ? t.summary ?? t.snippet : t.snippet;
  return (
    <Link
      to={withTab(`/inkorg/${t.id}`, tab)}
      className={`inbox-row${t.unread ? ' unread' : ''}${t.order ? '' : ' sorted'}${arrived ? ' arrived' : ''}`}
      aria-current={active ? 'true' : undefined}
    >
      <span>{t.unread && <span className="inbox-dot" title="Oläst" />}</span>
      <span className="inbox-from">
        {t.from_name ?? t.from_email}
        {t.count > 1 && <span className="t-muted" style={{ fontWeight: 400 }}> ({t.count})</span>}
      </span>
      <span className="inbox-time">{formatMailTime(t.last_at)}</span>
      <span className="inbox-line inbox-subject">{t.subject}</span>
      {t.order && (
        <span className={`inbox-line inbox-who${t.customer ? '' : ' new'}`}>{t.customer?.name ?? 'Ny avsändare'}</span>
      )}
      <span className="inbox-meta">
        {cat && <span className={`badge ${cat.badge}`}>{cat.label}</span>}
        {t.flags.includes('farligt_avfall') && <span className="badge badge-red">Farligt avfall</span>}
        <span className="text">{line}</span>
        {t.attachments && <Paperclip size={12} aria-label="Bilaga" />}
        {t.status === 'besvarad' && <CornerUpLeft size={12} aria-label="Besvarad" />}
      </span>
    </Link>
  );
}

/** The reading pane before a thread is picked: what came in today and how the inbox works. */
function ReaderIdle({ counts, demo }) {
  const total = (counts?.today.order ?? 0) + (counts?.today.bortsorterat ?? 0);
  return (
    <section className="panel inbox-empty">
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#eff6ff', color: '#1d4ed8' }}>
          <Sparkles size={20} />
        </div>
        <div>
          <h2 className="t-heading">
            {total ? `${total} mejl i dag: ${counts.today.order} gäller order, ${counts.today.bortsorterat} sorterades bort` : 'Inga nya mejl i dag'}
          </h2>
          <p className="t-muted" style={{ fontSize: 13, marginTop: 2 }}>
            {counts?.att_hantera ? `${counts.att_hantera} väntar på dig. Välj ett mejl till vänster.` : 'Allt är hanterat.'}
          </p>
        </div>
      </div>
      <div className="flow">
        <div className="flow-step">
          <span className="n">1</span>
          <h3>Mejlet kommer in</h3>
          <p>Åkaren läser bara er orderadress. Nyhetsbrev, fakturor och autosvar sorteras bort direkt, utan AI.</p>
        </div>
        <div className="flow-step">
          <span className="n">2</span>
          <h3>AI:n läser av ordern</h3>
          <p>Kund, projekt, datum, material och mängd plockas ut, även ur bifogade PDF:er. Det som saknas markeras.</p>
        </div>
        <div className="flow-step">
          <span className="n">3</span>
          <h3>Du granskar och svarar</h3>
          <p>Skapa uppdraget med ett klick och svara i samma tråd med en färdig mall. Inget skickas utan dig.</p>
        </div>
      </div>
      {demo && (
        <p className="t-muted" style={{ fontSize: 12.5 }}>
          Demo: tryck på <strong>Hämta ny post</strong> uppe till höger så kommer ett nytt mejl in och sorteras medan du tittar.
        </p>
      )}
    </section>
  );
}

/** No mailbox connected: what it will do, and (in demo mode) a way to try it. */
function Welcome({ demoAvailable, onStarted }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function startDemo() {
    setBusy(true);
    try {
      await api('/api/inbox/demo', { method: 'POST' });
      toast('Demoinkorgen är kopplad');
      inboxChanged();
      onStarted();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }
  const providers = [
    ['Microsoft 365 / Outlook', 'Logga in med Microsoft, som med Fortnox. Vanligast hos åkerier.'],
    ['Gmail / Google Workspace', 'Logga in med Google eller använd ett applösenord.'],
    ['Annan e-post (IMAP)', 'One.com, Loopia, Binero m.fl. Server, användarnamn och lösenord.'],
  ];
  return (
    <section className="panel inbox-empty" style={{ maxWidth: 820 }}>
      <div>
        <h2 className="t-heading">Koppla er order-e-post</h2>
        <p className="t-muted" style={{ marginTop: 4 }}>
          Koppla en adress som bara tar emot beställningar, t.ex. order@ert-akeri.se, eller en mapp som en regel i Outlook fyller.
          Åkaren läser bara den, flyttar och raderar ingenting, och kollar efter ny post varje minut.
        </p>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {providers.map(([name, text]) => (
          <div key={name} className="provider">
            <Server size={18} className="t-muted" />
            <div style={{ flex: 1 }}><strong>{name}</strong><span>{text}</span></div>
            <span className="badge badge-muted">Kommer snart</span>
          </div>
        ))}
      </div>
      {demoAvailable && (
        <div className="notice notice-blue" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>Demoläge: prova inkorgen med en vecka av påhittade mejl till order@testakeriet.se.</span>
          <Button size="sm" onClick={startDemo} loading={busy}><Mail size={13} /> Starta demoinkorgen</Button>
        </div>
      )}
    </section>
  );
}

export function Inbox({ params }) {
  const toast = useToast();
  const { query } = useLocation();
  const tab = TABS.some(([k]) => k === query.get('flik')) ? query.get('flik') : 'att_hantera';
  const [q, setQ] = useState('');
  const search = useDeferredValue(q.trim());
  const list = useApi(`/api/inbox?flik=${tab}${search ? `&q=${encodeURIComponent(search)}` : ''}`);
  const [fetching, setFetching] = useState(false);
  const [arrived, setArrived] = useState(null);
  const threadId = params.id ? Number(params.id) : null;
  const data = list.data;
  const { reload } = list;

  const refresh = useCallback(() => { reload(); inboxChanged(); }, [reload]);

  async function fetchMail() {
    setFetching(true);
    try {
      const r = await api('/api/inbox/sync', { method: 'POST' });
      const d = r.delivered;
      if (!d) toast('Inga nya mejl.');
      else if (d.category === 'ovrigt') toast(`Ett mejl sorterades bort: ${d.subject} (${d.filter_reason.toLowerCase()}).`);
      else toast(`Nytt mejl från ${d.from_name ?? 'okänd'}: ${INBOX_CATEGORY[d.category].label.toLowerCase()}. ${d.summary ?? ''}`.trim());
      setArrived(d?.thread_id ?? null);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setFetching(false);
    }
  }

  if (!data && list.loading) return <TableSkeleton rows={8} />;
  if (!data) return <ErrorNotice error={list.error} onRetry={reload} />;

  if (!data.account) {
    return (
      <>
        <PageHeader title="Inkorg" description="Beställningar som kommer in via e-post, sorterade och avlästa åt dig." />
        <Welcome demoAvailable={data.demo_available} onStarted={reload} />
      </>
    );
  }

  const counts = data.counts;
  return (
    <>
      <PageHeader
        title="Inkorg"
        description={<>Mejl till <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{data.account.address}</strong>. Åkaren sorterar ut beställningarna och läser av dem åt dig.</>}
        actions={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {data.demo && <span className="badge badge-blue" title="Påhittade mejl. Svar sparas men skickas inte på riktigt utan SMTP.">Demoinkorg</span>}
            <span className="t-muted" style={{ fontSize: 12 }}>Hämtad {formatAgo(data.account.last_sync_at)}</span>
            <Button variant="secondary" onClick={fetchMail} loading={fetching}>
              {!fetching && <RefreshCw size={14} />} Hämta ny post
            </Button>
          </div>
        )}
      />
      <ErrorNotice error={list.error} onRetry={reload} />

      <div className="inbox" data-open={threadId ? 'true' : 'false'}>
        <section className="panel inbox-list" aria-label="Mejl">
          <div className="inbox-tabs" role="tablist" aria-label="Välj lista">
            {TABS.map(([key, label]) => (
              <Link key={key} to={withTab('/inkorg', key)} className="inbox-tab" role="tab" aria-selected={tab === key}
                style={{ textAlign: 'center', textDecoration: 'none' }}>
                {label}<span className="n">{counts[key]}</span>
              </Link>
            ))}
          </div>
          <div className="inbox-search">
            <div className="search" style={{ width: '100%' }}>
              <Search size={15} />
              <input className="input" placeholder="Sök avsändare, kund eller ämne" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök i inkorgen" style={{ width: '100%' }} />
            </div>
          </div>
          <div className="inbox-rows">
            {fetching && (
              <div className="inbox-fetching" role="status">
                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Hämtar ny post och sorterar…
              </div>
            )}
            {data.threads.length === 0 ? (
              <div className="empty" style={{ padding: '32px 16px' }}>
                <InboxIcon size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
                <div>
                  {search ? 'Inga mejl matchar sökningen.'
                    : tab === 'att_hantera' ? 'Allt är hanterat. Nya beställningar hamnar här.'
                      : tab === 'bortsorterat' ? 'Inget har sorterats bort.' : 'Inga order-mejl än.'}
                </div>
              </div>
            ) : data.threads.map((t) => (
              <ThreadRow key={t.id} t={t} tab={tab} active={t.id === threadId} arrived={t.id === arrived} />
            ))}
          </div>
        </section>

        <div className="reader">
          {threadId
            ? <InboxThread key={threadId} id={threadId} tab={tab} onChanged={refresh} />
            : <ReaderIdle counts={counts} demo={data.demo} />}
        </div>
      </div>
    </>
  );
}
