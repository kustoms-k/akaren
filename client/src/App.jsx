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
import { LassQueue } from './pages/LassQueue.jsx';
import { LassDetail } from './pages/LassDetail.jsx';
import { Massredovisning } from './pages/Massredovisning.jsx';
import { Inbox } from './pages/Inbox.jsx';
import { Fakturaunderlag } from './pages/Fakturaunderlag.jsx';
import { PriceLists } from './pages/PriceLists.jsx';
import { Avstamning } from './pages/Avstamning.jsx';
import { AvstamningDetail } from './pages/AvstamningDetail.jsx';
import { Forlustkontroll } from './pages/Forlustkontroll.jsx';
import { Hittat } from './pages/Hittat.jsx';

const ROUTES = [
  ['/', Overview],
  ['/inkorg', Inbox],
  ['/inkorg/:id', Inbox],
  ['/bestallning', OrderInbox],
  ['/bestallning/:id', OrderReview],
  ['/uppdrag', Jobs],
  ['/uppdrag/:id', JobDetail],
  ['/lass', LassQueue],
  ['/lass/:id', LassDetail],
  ['/massor', Massredovisning],
  ['/avstamning', Avstamning],
  ['/avstamning/:id', AvstamningDetail],
  ['/forlustkontroll', Forlustkontroll],
  ['/hittat', Hittat],
  ['/faktura', Fakturaunderlag],
  ['/prislistor', PriceLists],
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
