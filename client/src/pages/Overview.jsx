import { useState } from 'react';
import {
  ArrowRight, CircleCheck, ClipboardCheck, Inbox, Mail, PlugZap, ReceiptText, Scale, TriangleAlert, Truck,
} from 'lucide-react';
import { PageHeader, ErrorNotice } from '../components/PageHeader.jsx';
import { Link } from '../components/Link.jsx';
import { DayBoard } from '../components/DayBoard.jsx';
import { DemoGuide } from '../components/DemoGuide.jsx';
import { shiftDate, todayLocal } from '../lib/days.js';
import { useApi } from '../lib/useApi.js';
import { useAuth } from '../lib/auth.js';
import { formatDate, formatKr } from '../lib/labels.js';

const longToday = () => new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' }).format(new Date());

function greeting() {
  const h = Number(new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', hour12: false, timeZone: 'Europe/Stockholm' }).format(new Date()));
  return h < 10 ? 'God morgon' : h < 18 ? 'Hej' : 'God kväll';
}

/** One thing to do: what, why, how much, and a click to the place where it's done. */
function Todo({ tone, Icon, title, detail, value, to }) {
  return (
    <Link to={to} className={`todo-row todo-${tone}`}>
      <span className="todo-icon"><Icon size={17} strokeWidth={1.9} /></span>
      <span style={{ minWidth: 0 }}>
        <div className="todo-title">{title}</div>
        {detail && <div className="todo-detail">{detail}</div>}
      </span>
      <span className="todo-value">{value}</span>
      <ArrowRight size={15} className="t-muted" />
    </Link>
  );
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const TONE_ORDER = { red: 0, amber: 1, blue: 2 };

/**
 * Everything waiting for the office, most urgent first: statutory deadlines and trucks missing today, then what
 * blocks Friday's invoicing, then the inflow of new orders.
 */
function buildTodos({ hazards, inbox, drafts, lass, avst, board, tomorrow, prevUnderlag, integrations }) {
  const todos = [];
  if (hazards?.length) {
    const overdue = hazards.filter((h) => h.state === 'forsenad').length;
    const first = hazards[0];
    todos.push({
      key: 'hazard', tone: overdue || first.state === 'idag' ? 'red' : 'amber', Icon: TriangleAlert,
      title: `Rapportera farligt avfall${overdue ? ` (${overdue} försenade)` : ''}`,
      detail: `${plural(hazards.length, 'transport', 'transporter')} till avfallsregistret. Närmast: ${first.project_name}, senast ${formatDate(first.deadline)}`,
      to: '/lass?flik=farligt',
    });
  }
  if (board?.uncovered.length) {
    todos.push({
      key: 'uncovered', tone: 'red', Icon: Truck,
      title: `${plural(board.uncovered.length, 'uppdrag', 'uppdrag')} utan bil idag`,
      detail: board.uncovered.map((j) => j.project_name).join(', '),
      to: board.uncovered.length === 1 ? `/uppdrag/${board.uncovered[0].id}` : '/uppdrag',
    });
  }
  if (tomorrow?.uncovered.length) {
    todos.push({
      key: 'uncovered-tomorrow', tone: 'amber', Icon: Truck,
      title: `${plural(tomorrow.uncovered.length, 'uppdrag', 'uppdrag')} utan bil imorgon`,
      detail: tomorrow.uncovered.map((j) => j.project_name).join(', '),
      to: tomorrow.uncovered.length === 1 ? `/uppdrag/${tomorrow.uncovered[0].id}` : '/uppdrag',
    });
  }
  if (integrations?.fortnox.status === 'reconnect_required') {
    todos.push({
      key: 'fortnox', tone: 'red', Icon: PlugZap, title: 'Anslut Fortnox igen',
      detail: 'Kopplingen har gått ut. Utkast kan inte skapas förrän den är ansluten.', to: '/installningar',
    });
  }
  if (lass?.to_review) {
    todos.push({
      key: 'review', tone: 'amber', Icon: ClipboardCheck,
      title: `${plural(lass.to_review, 'lass', 'lass')} att granska`,
      detail: 'Osäkra eller saknade uppgifter. De blockerar fakturaunderlaget tills de är granskade.',
      to: '/lass',
    });
  }
  if (avst?.saknas) {
    todos.push({
      key: 'weigh', tone: 'red', Icon: Scale,
      title: `${plural(avst.saknas, 'vägning', 'vägningar')} saknas i Åkaren`,
      detail: 'Vägda hos mottagaren men aldrig loggade. Utan lass blir de inte fakturerade.',
      value: avst.saknas_value_ore ? `≈ ${formatKr(avst.saknas_value_ore, { round: true })}` : null,
      to: '/avstamning',
    });
  }
  // Last week's underlag that is ready but not sent: the Friday promise.
  if (prevUnderlag?.totals.ready) {
    const t = prevUnderlag.totals;
    todos.push({
      key: 'underlag-prev', tone: t.blocked ? 'amber' : 'blue', Icon: ReceiptText,
      title: `Fakturera ${prevUnderlag.label.split(' · ')[0]}`,
      detail: `${plural(t.ready, 'underlag är klart', 'underlag är klara')} att skicka${t.blocked ? `, ${t.blocked} blockerade` : ''}.`,
      value: formatKr(t.ready_net_ore, { round: true }),
      to: `/faktura?vecka=${prevUnderlag.week}`,
    });
  } else if (prevUnderlag?.totals.blocked) {
    todos.push({
      key: 'underlag-prev', tone: 'amber', Icon: ReceiptText,
      title: `${prevUnderlag.label.split(' · ')[0]} kan inte faktureras än`,
      detail: `${plural(prevUnderlag.totals.blocked, 'underlag är blockerat', 'underlag är blockerade')}: lass att granska eller pris saknas.`,
      to: `/faktura?vecka=${prevUnderlag.week}`,
    });
  }
  if (inbox?.att_hantera) {
    todos.push({
      key: 'inbox', tone: 'blue', Icon: Mail,
      title: `${plural(inbox.att_hantera, 'mejl', 'mejl')} i inkorgen`,
      detail: 'Beställningar, ändringar och frågor som väntar på svar.',
      to: '/inkorg',
    });
  }
  if (drafts?.length) {
    todos.push({
      key: 'drafts', tone: 'blue', Icon: Inbox,
      title: `${plural(drafts.length, 'beställning', 'beställningar')} att bekräfta`,
      detail: drafts.slice(0, 3).map((d) => d.kund ?? 'Okänd kund').join(', '),
      to: drafts.length === 1 ? `/bestallning/${drafts[0].id}` : '/bestallning',
    });
  }
  return todos.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

function WeekPanel({ underlag }) {
  if (!underlag) return <section className="panel"><div className="skeleton" style={{ height: 180, margin: 18 }} /></section>;
  const t = underlag.totals;
  const share = t.groups ? Math.round(((t.ready + t.invoiced) / t.groups) * 100) : 0;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="t-heading">Fakturering {underlag.label.split(' · ')[0]}</h2>
        <Link to="/faktura" style={{ fontSize: 13 }}>Öppna</Link>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div className="t-label">Klart att fakturera</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 650, color: t.ready_net_ore ? 'var(--success)' : undefined }}>{formatKr(t.ready_net_ore, { round: true })}</div>
          </div>
          <div>
            <div className="t-label">Hela veckan hittills</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 650 }}>{formatKr(t.open_net_ore + t.invoiced_net_ore, { round: true })}</div>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }} className="t-muted">
            <span>{t.ready + t.invoiced} av {t.groups} underlag klara</span>
            {t.blocked > 0 && <span style={{ color: 'var(--amber)' }}>{t.blocked} blockerade</span>}
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-elevated)', overflow: 'hidden' }}>
            <div style={{ width: `${share}%`, height: '100%', background: 'var(--success)', transition: 'width 300ms var(--ease-out)' }} />
          </div>
        </div>
        <p className="t-muted" style={{ fontSize: 12.5 }}>
          Löftet till kunderna: fakturaunderlaget är klart på fredagen. Granska lassen under veckan så är det bara att skicka.
        </p>
      </div>
    </section>
  );
}

export function Overview() {
  const { user } = useAuth();
  const [datum, setDatum] = useState(todayLocal);
  const today = todayLocal();
  const tomorrowDate = shiftDate(today, 1);

  const hazards = useApi('/api/lass/farligt-avfall');
  const inbox = useApi('/api/inbox/summary');
  const drafts = useApi('/api/intake?status=utkast');
  const lass = useApi('/api/lass/summary');
  const avst = useApi('/api/avstamning/summary');
  const board = useApi(`/api/board?datum=${today}`);
  const tomorrow = useApi(`/api/board?datum=${tomorrowDate}`);
  const underlag = useApi('/api/fakturaunderlag');
  const prevUnderlag = useApi(underlag.data ? `/api/fakturaunderlag?week=${underlag.data.prev_week}` : null);
  const integrations = useApi('/api/settings/integrations');
  const demo = useApi('/api/auth/demo').data?.enabled === true;

  const sources = [hazards, inbox, drafts, lass, avst, board, tomorrow, underlag, prevUnderlag];
  const error = sources.find((s) => s.error)?.error;
  const ready = [hazards, drafts, lass, board].every((s) => s.data);
  const todos = ready ? buildTodos({
    hazards: hazards.data, inbox: inbox.data, drafts: drafts.data, lass: lass.data, avst: avst.data, board: board.data,
    tomorrow: tomorrow.data, prevUnderlag: prevUnderlag.data, integrations: integrations.data,
  }) : null;

  return (
    <>
      <PageHeader
        title={`${greeting()} ${user?.name ?? ''}`.trim()}
        description={`${longToday().replace(/^./, (c) => c.toUpperCase())}${underlag.data ? ` · ${underlag.data.label.split(' · ')[0]}` : ''}`}
      />
      <ErrorNotice error={error} onRetry={() => sources.forEach((s) => s.reload())} />
      {demo && <DemoGuide />}

      <div className="overview-grid" style={{ marginBottom: 16 }}>
        <section className="panel">
          <div className="panel-head">
            <h2 className="t-heading">Att göra</h2>
            {todos?.length > 0 && <span className="t-muted" style={{ fontSize: 13 }}>{plural(todos.length, 'sak', 'saker')}</span>}
          </div>
          {!todos ? (
            <div style={{ padding: 18, display: 'grid', gap: 12 }}>
              {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 34 }} />)}
            </div>
          ) : todos.length === 0 ? (
            <div className="todo-done">
              <CircleCheck size={18} style={{ color: 'var(--success)' }} />
              Inget väntar just nu. Nya mejl, lass och vägningar dyker upp här.
            </div>
          ) : (
            <div className="todo">{todos.map(({ key, ...t }) => <Todo key={key} {...t} />)}</div>
          )}
        </section>
        <WeekPanel underlag={underlag.data} />
      </div>

      <DayBoard datum={datum} onDatum={setDatum} />
    </>
  );
}
