import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Briefcase, Building2, ClipboardCheck, FileSpreadsheet, LayoutDashboard, LogOut, Mail, Menu, Plus, ReceiptText, Scale, SearchCheck, Settings, Truck,
} from 'lucide-react';
import { LogoMark, Wordmark } from '../assets/Logo.jsx';
import { useLocation } from '../lib/router.js';
import { Link } from './Link.jsx';
import { useAuth } from '../lib/auth.js';
import { useWorkCounts } from '../lib/workCounts.js';

// Grouped the way the week runs: today's work, the loads, Friday's invoicing, and the registers behind it all.
// `badge` picks what the item counts from the shared work counts: [count, tone, label].
const NAV = [
  {
    items: [
      { to: '/', label: 'Översikt', Icon: LayoutDashboard, match: (p) => p === '/' },
      { to: '/inkorg', label: 'Inkorg', Icon: Mail, match: (p) => p.startsWith('/inkorg'), badge: (c) => [c.inbox, 'blue', 'att hantera'] },
      { to: '/uppdrag', label: 'Uppdrag', Icon: Briefcase, match: (p) => p.startsWith('/uppdrag') },
    ],
  },
  {
    title: 'Lass',
    items: [
      {
        to: '/lass', label: 'Granska lass', Icon: ClipboardCheck, match: (p) => p.startsWith('/lass'),
        badge: (c) => [c.review, c.hazardOverdue ? 'red' : 'amber', c.hazardOverdue ? 'att granska, farligt avfall försenat' : 'att granska'],
      },
      { to: '/avstamning', label: 'Avstämning', Icon: Scale, match: (p) => p.startsWith('/avstamning'), badge: (c) => [c.weighMissing, 'red', 'vägningar saknas'] },
      { to: '/massor', label: 'Massredovisning', Icon: FileSpreadsheet, match: (p) => p.startsWith('/massor') },
    ],
  },
  {
    title: 'Fakturering',
    items: [
      { to: '/faktura', label: 'Fakturaunderlag', Icon: ReceiptText, match: (p) => p.startsWith('/faktura') || p.startsWith('/prislistor') },
      { to: '/forlustkontroll', label: 'Förlustkontroll', Icon: SearchCheck, match: (p) => p.startsWith('/forlustkontroll') },
    ],
  },
  {
    title: 'Register',
    items: [
      { to: '/kunder', label: 'Kunder & projekt', Icon: Building2, match: (p) => p.startsWith('/kunder') },
      { to: '/flotta', label: 'Fordon & förare', Icon: Truck, match: (p) => p.startsWith('/flotta') },
      { to: '/installningar', label: 'Inställningar', Icon: Settings, match: (p) => p.startsWith('/installningar') },
    ],
  },
];

export function AppShell({ children }) {
  const { path } = useLocation();
  const { company, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const counts = useWorkCounts(path);
  const onOrder = path.startsWith('/bestallning');

  return (
    <div className="app">
      <div className="mobile-topbar">
        <button type="button" onClick={() => setOpen(true)} aria-label="Öppna meny" style={{ background: 'none', border: 'none', display: 'flex', padding: 4 }}>
          <Menu size={20} />
        </button>
        <LogoMark size={24} />
        <Wordmark size={16} />
        {(counts.inbox + counts.review + counts.weighMissing) > 0 && (
          <span className="nav-count nav-count-red" style={{ marginLeft: 'auto' }} aria-label="Saker att hantera">
            {counts.inbox + counts.review + counts.weighMissing}
          </span>
        )}
      </div>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Huvudmeny">
        <div className="sidebar-brand">
          <LogoMark size={28} title="Lasskoll" />
          <Wordmark size={18} />
        </div>
        <Link to="/bestallning" className="sidebar-cta" aria-current={onOrder ? 'page' : undefined} onClick={() => setOpen(false)}>
          <Plus size={15} strokeWidth={2.2} />
          <span>Ny beställning</span>
          {counts.drafts > 0 && <span className="nav-count nav-count-light" aria-label={`${counts.drafts} utkast att granska`}>{counts.drafts}</span>}
        </Link>
        {NAV.map((group, gi) => (
          <div key={gi} className="nav-group">
            {group.title && <div className="nav-group-title">{group.title}</div>}
            {group.items.map(({ to, label, Icon, match, badge }) => {
              const active = match(path);
              const [n, tone, what] = badge ? badge(counts) : [0];
              return (
                <Link key={to} to={to} className="nav-item" aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)}>
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="nav-item-bg"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{label}</span>
                  {n > 0 && <span className={`nav-count nav-count-${tone}`} aria-label={`${n} ${what}`}>{n}</span>}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="sidebar-company">
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{company?.name}</div>
          <div>{user?.email}</div>
          <button
            type="button"
            onClick={logout}
            className="nav-item"
            style={{ marginTop: 8, padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
          >
            <LogOut size={14} /> Logga ut
          </button>
        </div>
      </nav>

      <main className="main page-enter" key={path.split('/')[1]}>
        {children}
      </main>
    </div>
  );
}
