import { useState } from 'react';
import { LogoMark } from '../assets/Logo.jsx';
import { Button } from '../components/Button.jsx';
import { TextField } from '../components/Field.jsx';
import { useAuth } from '../lib/auth.js';

export function Login() {
  const { login } = useAuth();
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
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form onSubmit={submit} className="panel page-enter" style={{ width: 'min(380px, 100%)', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <LogoMark size={26} />
          <span style={{ fontWeight: 650, fontSize: 18, letterSpacing: '-0.02em' }}>Åkaren</span>
        </div>
        <p className="t-muted" style={{ marginBottom: 22, fontSize: 13 }}>
          Beställningar, lass och fakturaunderlag på ett ställe.
        </p>
        <div style={{ display: 'grid', gap: 14 }}>
          <TextField label="E-post" type="email" autoComplete="username" required value={email} onChange={setEmail} autoFocus />
          <TextField label="Lösenord" type="password" autoComplete="current-password" required value={password} onChange={setPassword} />
          {error && <div className="notice notice-red" role="alert">{error}</div>}
          <Button type="submit" size="lg" loading={busy} style={{ width: '100%', marginTop: 4 }}>
            Logga in
          </Button>
        </div>
      </form>
    </div>
  );
}
