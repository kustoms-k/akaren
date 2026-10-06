import { useState } from 'react';
import { Check } from 'lucide-react';
import { LogoFull, LogoMark, Wordmark } from '../assets/Logo.jsx';
import { Button } from '../components/Button.jsx';
import { TextField } from '../components/Field.jsx';
import { useAuth } from '../lib/auth.js';
import { useApi } from '../lib/useApi.js';

// What the product does, in the customer's words: the three jobs, and the promise.
const POINTS = [
  'Beställningarna läses ur mejlen och blir uppdrag när kontoret bekräftar.',
  'Föraren fotar vågsedeln med mobilen. Ingen app, inget konto.',
  'Fakturaunderlaget är klart på fredagen, och ni kan visa vart varje lass tog vägen.',
];

export function Login() {
  const { login } = useAuth();
  // Demo mode (server DEMO_MODE=1): empty fields log straight in.
  const demo = useApi('/api/auth/demo').data?.enabled === true;
  // Dev only: prefill from client/.env.local so local testing is one click.
  const [email, setEmail] = useState(import.meta.env.DEV ? import.meta.env.VITE_DEV_EMAIL ?? '' : '');
  const [password, setPassword] = useState(import.meta.env.DEV ? import.meta.env.VITE_DEV_PASSWORD ?? '' : '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-brand">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoMark size={36} tone="white" />
          <Wordmark size={22} color="#ffffff" />
        </div>
        <div style={{ display: 'grid', gap: 28 }}>
          <h1 className="login-claim">Koll på varje lass.</h1>
          <div className="login-points">
            {POINTS.map((p) => (
              <div key={p}><Check size={18} strokeWidth={2.4} /><span>{p}</span></div>
            ))}
          </div>
        </div>
        <div className="login-foot">För åkerier inom schakt och anläggning. Körs bredvid ert nuvarande system.</div>
      </aside>

      <div className="login-form-wrap">
        <form onSubmit={submit} className="login-form page-enter">
          <div className="login-mobile-brand" style={{ marginBottom: 8 }}>
            <LogoFull markSize={36} />
          </div>
          <div>
            <h2 className="t-display">Logga in</h2>
            <p className="t-muted" style={{ marginTop: 4, fontSize: 13.5 }}>Beställningar, lass och fakturaunderlag på ett ställe.</p>
          </div>
          {demo && <div className="notice notice-blue">Demoläge: klicka på Logga in, du behöver inte fylla i något.</div>}
          <TextField label="E-post" type="email" autoComplete="username" required={!demo} value={email} onChange={setEmail} autoFocus />
          <TextField label="Lösenord" type="password" autoComplete="current-password" required={!demo} value={password} onChange={setPassword} />
          {error && <div className="notice notice-red" role="alert">{error}</div>}
          <Button type="submit" size="lg" loading={busy} style={{ width: '100%', marginTop: 4 }}>
            Logga in
          </Button>
        </form>
      </div>
    </div>
  );
}
