import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Briefcase, Building2, ClipboardCheck, ClipboardPaste, FileSpreadsheet, LayoutDashboard, LogOut, Mail, Menu, ReceiptText, Settings, Truck } from 'lucide-react';
import { LogoMark } from '../assets/Logo.jsx';
import { useLocation } from '../lib/router.js';
import { Link } from './Link.jsx';
import { useAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';
import { onInboxChanged } from '../lib/inboxEvents.js';

const NAV = [
  { to: '/', label: 'Översikt', Icon: LayoutDashboard, match: (p) => p === '/' },
  { to: '/inkorg', label: 'Inkorg', Icon: Mail, match: (p) => p.startsWith('/inkorg'), count: 'inbox' },
  { to: '/bestallning', label: 'Ny beställning', Icon: ClipboardPaste, match: (p) => p.startsWith('/bestallning') },
  { to: '/uppdrag', label: 'Uppdrag', Icon: Briefcase, match: (p) => p.startsWith('/uppdrag') },
  { to: '/lass', label: 'Granska lass', Icon: ClipboardCheck, match: (p) => p.startsWith('/lass') },
  { to: '/massor', label: 'Massredovisning', Icon: FileSpreadsheet, match: (p) => p.startsWith('/massor') },
  { to: '/faktura', label: 'Fakturaunderlag', Icon: ReceiptText, match: (p) => p.startsWith('/faktura') || p.startsWith('/prislistor') },
  { to: '/kunder', label: 'Kunder & projekt', Icon: Building2, match: (p) => p.startsWith('/kunder') },
  { to: '/flotta', label: 'Fordon & förare', Icon: Truck, match: (p) => p.startsWith('/flotta') },
  { to: '/installningar', label: 'Inställningar', Icon: Settings, match: (p) => p.startsWith('/installningar') },
];

export function AppShell({ children }) {
  const { path } = useLocation();
  const { company, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  // Order mail waiting in the inbox: refreshed on navigation, when the inbox changes, and every minute.
  useEffect(() => {
    let alive = true;
    const load = () => api('/api/inbox/summary').then((s) => { if (alive) setInboxCount(s.att_hantera); }).catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    const off = onInboxChanged(load);
    return () => { alive = false; clearInterval(timer); off(); };
  }, [path]);

  return (
    <div className="app">
      <div className="mobile-topbar">
        <button type="button" onClick={() => setOpen(true)} aria-label="Öppna meny" style={{ background: 'none', border: 'none', display: 'flex', padding: 4 }}>
          <Menu size={20} />
        </button>
        <LogoMark size={22} />
        <span>Åkaren</span>
      </div>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Huvudmeny">
        <div className="sidebar-brand">
          <LogoMark size={24} />
          <span>Åkaren</span>
        </div>
        {NAV.map(({ to, label, Icon, match, count }) => {
          const active = match(path);
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
              {count === 'inbox' && inboxCount > 0 && <span className="nav-count" aria-label={`${inboxCount} att hantera`}>{inboxCount}</span>}
            </Link>
          );
        })}
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
