import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LogoFull, LogoMark } from '../assets/Logo.jsx';

const INTER  = "'Inter', sans-serif";
const BLUE   = '#6366f1';
const TEXT   = '#1a1a2e';
const MUTED  = '#6c757d';
const BG     = '#f4f5f9';
const WHITE  = '#ffffff';
const BORDER = '#e2e5ef';

// ── Noise overlay for the hero panel ────────────────────────────────────────
// A very subtle fractal-noise SVG injected as a background
const NOISE_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E")`;

function inputStyle(focused) {
  return {
    fontFamily: INTER, width: '100%', padding: '11px 14px',
    border: `1.5px solid ${focused ? BLUE : BORDER}`,
    borderRadius: 9, fontSize: 14, color: TEXT,
    background: focused ? WHITE : '#fafbff',
    outline: 'none', boxSizing: 'border-box',
    boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.14)' : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
  };
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontFamily: INTER, fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.02em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FocusInput({ type = 'text', value, onChange, placeholder, autoFocus }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      autoFocus={autoFocus}
      style={inputStyle(focused)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ── Left hero panel ──────────────────────────────────────────────────────────
function HeroPanel({ lang }) {
  const features = lang === 'sv'
    ? [
        { icon: '⚡', text: 'AI skapar komplett offert på sekunder' },
        { icon: '🔗', text: 'Kundportaler med privat länk inkluderade' },
        { icon: '📊', text: 'Lönsamhetsrapporter per fordon och rutt' },
        { icon: '🛡️', text: 'GDPR-kompatibel med revisionslogg' },
      ]
    : [
        { icon: '⚡', text: 'AI builds complete quotes in seconds' },
        { icon: '🔗', text: 'Customer portals with private links included' },
        { icon: '📊', text: 'Profitability reports per vehicle and route' },
        { icon: '🛡️', text: 'GDPR-compliant with full audit log' },
      ];

  return (
    <div style={{
      flex: '0 0 58%',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(145deg, #080b1a 0%, #0f1640 35%, #1a237e 68%, #0d2b6b 100%)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '56px 52px',
      minHeight: '100%',
    }}>
      {/* Noise grain overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: NOISE_URI,
        backgroundRepeat: 'repeat',
        pointerEvents: 'none',
        zIndex: 1,
      }} />

      {/* Decorative orbs */}
      <div style={{
        position: 'absolute', top: '-80px', right: '-60px',
        width: 340, height: 340, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,133,255,0.22) 0%, transparent 70%)',
        filter: 'blur(32px)',
        pointerEvents: 'none', zIndex: 1,
      }} />
      <div style={{
        position: 'absolute', bottom: '-60px', left: '-40px',
        width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)',
        filter: 'blur(40px)',
        pointerEvents: 'none', zIndex: 1,
      }} />
      <div style={{
        position: 'absolute', top: '55%', right: '12%',
        width: 180, height: 180, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 70%)',
        filter: 'blur(30px)',
        pointerEvents: 'none', zIndex: 1,
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {/* Large mark */}
        <div style={{ marginBottom: 32 }}>
          <LogoMark size={64} />
        </div>

        {/* Wordmark */}
        <div style={{
          fontFamily: INTER, fontWeight: 800, fontSize: 38,
          letterSpacing: '3px', color: WHITE, lineHeight: 1,
          marginBottom: 6,
        }}>
          ÅKAREN
        </div>
        <div style={{
          fontFamily: INTER, fontWeight: 500, fontSize: 10,
          letterSpacing: '4px', color: 'rgba(255,255,255,0.45)',
          marginBottom: 28,
        }}>
          OFFERT AI
        </div>

        {/* Tagline */}
        <p style={{
          fontFamily: INTER, fontSize: 16, color: 'rgba(255,255,255,0.80)',
          lineHeight: 1.65, marginBottom: 40, maxWidth: 360, fontWeight: 400,
        }}>
          {lang === 'sv'
            ? 'Transporthantering för svenska åkerier — offert till faktura på en plats.'
            : 'Transport management for Swedish hauliers — quote to invoice in one place.'}
        </p>

        {/* Feature bullets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {features.map((f) => (
            <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: 'rgba(255,255,255,0.10)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14,
              }}>
                {f.icon}
              </div>
              <span style={{
                fontFamily: INTER, fontSize: 13, color: 'rgba(255,255,255,0.75)',
                fontWeight: 500, lineHeight: 1.4,
              }}>
                {f.text}
              </span>
            </div>
          ))}
        </div>

        {/* Decorative divider line */}
        <div style={{
          marginTop: 48,
          height: 1,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.15) 0%, transparent 100%)',
          maxWidth: 300,
        }} />
        <div style={{
          marginTop: 16,
          fontFamily: INTER, fontSize: 11, color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.04em',
        }}>
          © 2025 Åkaren Offert AI
        </div>
      </div>
    </div>
  );
}

// ── Main Login component ─────────────────────────────────────────────────────
export function Login() {
  const { login } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const [tab, setTab] = useState('login');

  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword,  setShowPassword]  = useState(false);
  const [loginError,    setLoginError]    = useState(false);
  const [loginLoading,  setLoginLoading]  = useState(false);

  const [regCompany,  setRegCompany]  = useState('');
  const [regOrgNr,    setRegOrgNr]    = useState('');
  const [regName,     setRegName]     = useState('');
  const [regEmail,    setRegEmail]    = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regError,    setRegError]    = useState(null);
  const [regLoading,  setRegLoading]  = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;
    setLoginLoading(true);
    setLoginError(false);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      login(data);
    } catch {
      setLoginError(true);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!regCompany.trim() || !regEmail.trim() || !regPassword) return;
    if (regPassword.length < 8) { setRegError(t.login.passwordMin); return; }
    setRegLoading(true);
    setRegError(null);
    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: regCompany.trim(),
          org_nr:       regOrgNr.trim()  || null,
          user_name:    regName.trim()   || null,
          user_email:   regEmail.trim(),
          password:     regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');
      login(data);
    } catch (err) {
      setRegError(err.message || 'Registration failed');
    } finally {
      setRegLoading(false);
    }
  }

  const tabBtn = (id, lbl) => (
    <button
      onClick={() => setTab(id)}
      style={{
        flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
        fontFamily: INTER, fontSize: 13, fontWeight: 600,
        background: 'transparent',
        color: tab === id ? BLUE : MUTED,
        borderBottom: `2px solid ${tab === id ? BLUE : BORDER}`,
        transition: 'all 0.15s',
      }}
    >
      {lbl}
    </button>
  );

  const canLogin = loginEmail.trim() && loginPassword && !loginLoading;
  const canReg   = regCompany.trim() && regEmail.trim() && regPassword && !regLoading;

  return (
    <>
      <style>{`
        @media (max-width: 768px) { .login-hero { display: none !important; } }
      `}</style>
      <div style={{
        fontFamily: INTER,
        minHeight: '100vh',
        display: 'flex',
        background: BG,
      }}>
        {/* ── Left hero panel ── */}
        <div className="login-hero" style={{ display: 'flex', flex: '0 0 58%' }}>
          <HeroPanel lang={lang} />
        </div>

        {/* ── Right form panel ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 32px',
          background: WHITE,
          overflowY: 'auto',
          minHeight: '100vh',
        }}>
          {/* Mobile-only logo */}
          <div className="login-hero" style={{ display: 'none' }}>
            <div style={{ marginBottom: 32 }}>
              <LogoFull markSize={28} />
            </div>
          </div>

          <div style={{ width: '100%', maxWidth: 380 }}>
            {/* Lang toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
              <div style={{
                display: 'flex', gap: 2,
                background: BG, borderRadius: 8, padding: 3,
              }}>
                {['en', 'sv'].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    style={{
                      fontFamily: INTER, fontSize: 11, fontWeight: 600,
                      background: lang === l ? WHITE : 'transparent',
                      color: lang === l ? BLUE : MUTED,
                      border: 'none',
                      borderRadius: 6,
                      padding: '5px 12px',
                      cursor: 'pointer',
                      boxShadow: lang === l ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Heading */}
            <div style={{ marginBottom: 28 }}>
              <h1 style={{
                fontFamily: INTER, fontWeight: 700, fontSize: 24,
                color: TEXT, margin: '0 0 6px', letterSpacing: '-0.3px',
              }}>
                {tab === 'login' ? t.login.signIn : t.login.register}
              </h1>
              <p style={{ fontFamily: INTER, fontSize: 13, color: MUTED, margin: 0 }}>
                {t.login.tagline}
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', marginBottom: 28 }}>
              {tabBtn('login',    t.login.signIn)}
              {tabBtn('register', t.login.register)}
            </div>

            {/* ── Login form ── */}
            {tab === 'login' && (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Field label={t.login.email}>
                  <FocusInput
                    type="email" value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    autoFocus
                  />
                </Field>

                <Field label={t.login.password}>
                  <div style={{ position: 'relative' }}>
                    <FocusInput
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                    <button
                      type="button" tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: INTER, fontSize: 11, color: MUTED, padding: 0,
                      }}
                    >
                      {showPassword ? t.login.hide : t.login.show}
                    </button>
                  </div>
                </Field>

                {loginError && (
                  <div style={{
                    background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8,
                    padding: '10px 14px', color: '#c53030', fontSize: 13,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 16 }}>⚠</span>
                    {t.login.wrongCreds}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canLogin}
                  style={{
                    fontFamily: INTER, width: '100%', fontWeight: 700, fontSize: 14,
                    padding: '13px', borderRadius: 9, border: 'none', marginTop: 4,
                    background: canLogin
                      ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                      : '#c8cfea',
                    color: WHITE,
                    cursor: canLogin ? 'pointer' : 'not-allowed',
                    letterSpacing: '0.02em',
                    boxShadow: canLogin ? '0 2px 6px rgba(99,102,241,0.28)' : 'none',
                    transition: 'box-shadow 0.15s',
                  }}
                >
                  {loginLoading ? t.login.signingIn : t.login.signInBtn}
                </button>
              </form>
            )}

            {/* ── Register form ── */}
            {tab === 'register' && (
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <Field label={t.login.company}>
                  <FocusInput value={regCompany} onChange={(e) => setRegCompany(e.target.value)} placeholder="Svensson Åkeri AB" autoFocus />
                </Field>
                <Field label={t.login.orgNr}>
                  <FocusInput value={regOrgNr} onChange={(e) => setRegOrgNr(e.target.value)} placeholder="556789-0123" />
                </Field>
                <Field label={t.login.yourName}>
                  <FocusInput value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Anna Svensson" />
                </Field>
                <Field label={t.login.workEmail}>
                  <FocusInput type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="anna@svenssons.se" />
                </Field>
                <Field label={t.login.passwordMin}>
                  <FocusInput type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
                </Field>

                {regError && (
                  <div style={{
                    background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8,
                    padding: '10px 14px', color: '#c53030', fontSize: 13,
                  }}>
                    {regError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canReg}
                  style={{
                    fontFamily: INTER, width: '100%', fontWeight: 700, fontSize: 14,
                    padding: '13px', borderRadius: 9, border: 'none', marginTop: 4,
                    background: canReg
                      ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                      : '#c8cfea',
                    color: WHITE,
                    cursor: canReg ? 'pointer' : 'not-allowed',
                    boxShadow: canReg ? '0 2px 6px rgba(99,102,241,0.28)' : 'none',
                  }}
                >
                  {regLoading ? t.login.creating : t.login.createBtn}
                </button>

                <p style={{ fontSize: 11, color: MUTED, margin: 0, textAlign: 'center', lineHeight: 1.6 }}>
                  {t.login.setupNote}
                </p>
              </form>
            )}

            <div style={{ fontSize: 11, color: '#b0b8cc', textAlign: 'center', marginTop: 28, lineHeight: 1.6 }}>
              {t.login.pricing}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
