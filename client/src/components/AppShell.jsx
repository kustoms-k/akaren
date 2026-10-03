import { useState } from 'react';
import { motion } from 'motion/react';
import { Briefcase, Building2, Inbox, LayoutDashboard, LogOut, Menu, Settings, Truck } from 'lucide-react';
import { LogoMark } from '../assets/Logo.jsx';
import { useLocation } from '../lib/router.js';
import { Link } from './Link.jsx';
import { useAuth } from '../lib/auth.js';

// Later phases add: Granska lass, Massredovisning, Fakturaunderlag.
const NAV = [
  { to: '/', label: 'Översikt', Icon: LayoutDashboard, match: (p) => p === '/' },
  { to: '/bestallning', label: 'Ny beställning', Icon: Inbox, match: (p) => p.startsWith('/bestallning') },
  { to: '/uppdrag', label: 'Uppdrag', Icon: Briefcase, match: (p) => p.startsWith('/uppdrag') },
  { to: '/kunder', label: 'Kunder & projekt', Icon: Building2, match: (p) => p.startsWith('/kunder') },
  { to: '/flotta', label: 'Fordon & förare', Icon: Truck, match: (p) => p.startsWith('/flotta') },
  { to: '/installningar', label: 'Inställningar', Icon: Settings, match: (p) => p.startsWith('/installningar') },
];

export function AppShell({ children }) {
  const { path } = useLocation();
  const { company, user, logout } = useAuth();
  const [open, setOpen] = useState(false);

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
        {NAV.map(({ to, label, Icon, match }) => {
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
