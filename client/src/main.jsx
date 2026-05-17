import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App                   from './App.jsx';
import { PublicQuote }       from './pages/PublicQuote.jsx';
import { CustomerPortal }    from './pages/CustomerPortal.jsx';
import { LanguageProvider }  from './context/LanguageContext.jsx';

const path = window.location.pathname;

const quoteMatch  = path.match(/^\/quote\/([^/]+)/);
const portalMatch = path.match(/^\/portal\/([^/]+)/);

const Root = quoteMatch
  ? () => <PublicQuote token={quoteMatch[1]} />
  : portalMatch
    ? () => <CustomerPortal token={portalMatch[1]} />
    : App;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <Root />
    </LanguageProvider>
  </StrictMode>,
);
