import { AuthProvider } from './context/AuthContext.jsx';
import { useAuth } from './lib/auth.js';
import { ToastProvider } from './components/Toast.jsx';
import { AppShell } from './components/AppShell.jsx';
import { matchPath, useLocation, useScrollReset } from './lib/router.js';
import { Login } from './pages/Login.jsx';
import { Overview } from './pages/Overview.jsx';
import { Customers } from './pages/Customers.jsx';
import { CustomerDetail } from './pages/CustomerDetail.jsx';
import { Fleet } from './pages/Fleet.jsx';
import { Settings } from './pages/Settings.jsx';
import { NotFound } from './pages/NotFound.jsx';
import { OrderInbox } from './pages/OrderInbox.jsx';
import { OrderReview } from './pages/OrderReview.jsx';
import { Jobs } from './pages/Jobs.jsx';
import { JobDetail } from './pages/JobDetail.jsx';

const ROUTES = [
  ['/', Overview],
  ['/bestallning', OrderInbox],
  ['/bestallning/:id', OrderReview],
  ['/uppdrag', Jobs],
  ['/uppdrag/:id', JobDetail],
  ['/kunder', Customers],
  ['/kunder/:id', CustomerDetail],
  ['/flotta', Fleet],
  ['/installningar', Settings],
];

function OfficeRoutes() {
  const { path } = useLocation();
  useScrollReset(path);
  for (const [pattern, Page] of ROUTES) {
    const params = matchPath(pattern, path);
    if (params) return <Page params={params} />;
  }
  return <NotFound />;
}

function Gate() {
  const { status } = useAuth();
  if (status === 'checking') return null;
  if (status !== 'authenticated') return <Login />;
  return (
    <AppShell>
      <OfficeRoutes />
    </AppShell>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}
