import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LogoFull, LogoMark } from '../assets/Logo.jsx';

const OUTFIT = "'Outfit', system-ui, sans-serif";
const AMBER  = '#c9a84c';
const AMBER_DK = '#b8932a';
const TEXT   = '#17161a';
const MUTED  = '#6b6574';
const BG     = '#f5f3ee';
const WHITE  = '#ffffff';
const BORDER = '#e6e2da';
const NAV    = '#111118';

const NOISE_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E")`;

function inputStyle(focused) {
  return {
    fontFamily: OUTFIT,
    width: '100%',
    padding: '11px 14px',
    border: `1.5px solid ${focused ? AMBER : BORDER}`,
    borderRadius: 9,
    fontSize: 14,
    color: TEXT,
    background: focused ? WHITE : '#faf9f6',
    outline: 'none',
    boxSizing: 'border-box',
    boxShadow: focused ? `0 0 0 3px rgba(201,168,76,0.14)` : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
  };
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontFamily: OUTFIT, fontSize: 12, fontWeight: 600, color: '#4a4550', letterSpacing: '0.03em' }}>
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

// ── Feature list icons (no emojis — SVG only) ────────────────────────────────
function IconAI() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="rgba(201,168,76,0.7)" strokeWidth="1.2" />
      <path d="M5 8.5L7 10.5L11 6" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 10L10 6M7 5.5H4.5a2 2 0 000 4h1M9 10.5h2.5a2 2 0 000-4H9" stroke="#c9a84c" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="9" width="2.5" height="4" rx="1" fill="#c9a84c" opacity="0.7" />
      <rect x="6.75" y="6" width="2.5" height="7" rx="1" fill="#c9a84c" />
      <rect x="10.5" y="3" width="2.5" height="10" rx="1" fill="#c9a84c" opacity="0.7" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L3 4.5v4C3 11.5 5.5 14 8 14s5-2.5 5-5.5v-4L8 2z" stroke="#c9a84c" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
      <path d="M6 8l1.5 1.5L10 6.5" stroke="#c9a84c" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Left hero panel ──────────────────────────────────────────────────────────
function HeroPanel({ lang }) {
  const features = lang === 'sv'
    ? [
        { Icon: IconAI,     text: 'AI extraherar komplett offert på sekunder' },
        { Icon: IconLink,   text: 'Kundportaler med privata spårningslänkar' },
        { Icon: IconChart,  text: 'Lönsamhetsanalys per fordon, rutt och kund' },
        { Icon: IconShield, text: 'GDPR-kompatibel med fullständig revisionslogg' },
      ]
    : [
        { Icon: IconAI,     text: 'AI builds complete quotes in seconds' },
        { Icon: IconLink,   text: 'Customer portals with private tracking links' },
        { Icon: IconChart,  text: 'Profitability analysis per vehicle, route & client' },
        { Icon: IconShield, text: 'GDPR-compliant with full audit trail' },
      ];

  return (
    <div style={{
      flex: '0 0 56%',
      position: 'relative',
      overflow: 'hidden',
      background: `linear-gradient(160deg, ${NAV} 0%, #1a1820 55%, #211e16 100%)`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '56px 52px',
      minHeight: '100%',
    }}>
      {/* Noise grain */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: NOISE_URI,
        backgroundRepeat: 'repeat',
        pointerEvents: 'none', zIndex: 1,
      }} />
      {/* Amber glow orb */}
      <div style={{
        position: 'absolute', bottom: '-60px', right: '-40px',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(201,168,76,0.16) 0%, transparent 65%)',
        filter: 'blur(30px)',
        pointerEvents: 'none', zIndex: 1,
      }} />
      <div style={{
        position: 'absolute', top: '30%', left: '-80px',
        width: 240, height: 240, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)',
        filter: 'blur(40px)',
        pointerEvents: 'none', zIndex: 1,
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ marginBottom: 36 }}>
          <LogoMark size={60} glow />
        </div>

        <div style={{
          fontFamily: OUTFIT,
          fontWeight: 800,
          fontSize: 42,
          letterSpacing: '0.10em',
          color: WHITE,
          lineHeight: 1,
          marginBottom: 4,
        }}>
          ÅKAREN
        </div>
        <div style={{
          fontFamily: OUTFIT,
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: '0.30em',
          color: 'rgba(255,255,255,0.35)',
          marginBottom: 32,
          textTransform: 'uppercase',
        }}>
          TRANSPORT AI
        </div>

        {/* Amber divider */}
        <div style={{
          width: 40, height: 2,
          background: `linear-gradient(90deg, ${AMBER} 0%, transparent 100%)`,
          marginBottom: 28,
        }} />

        <p style={{
          fontFamily: OUTFIT,
          fontSize: 16,
          color: 'rgba(255,255,255,0.72)',
          lineHeight: 1.7,
          marginBottom: 40,
          maxWidth: 340,
          fontWeight: 400,
        }}>
          {lang === 'sv'
            ? 'Transporthantering för svenska åkerier — från offert till faktura på ett ställe.'
            : 'Transport management for Swedish hauliers — from quote to invoice in one place.'}
        </p>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {features.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 30, height: 30,
                borderRadius: 7,
                background: 'rgba(201,168,76,0.12)',
                border: '1px solid rgba(201,168,76,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <f.Icon />
              </div>
              <span style={{
                fontFamily: OUTFIT,
                fontSize: 13,
                color: 'rgba(255,255,255,0.68)',
                fontWeight: 400,
                lineHeight: 1.45,
              }}>
                {f.text}
              </span>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 52,
          fontFamily: OUTFIT,
          fontSize: 10,
          color: 'rgba(255,255,255,0.22)',
          letterSpacing: '0.05em',
        }}>
          15 000 kr/månad · Obegränsat antal offerter
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

  const tabBtn = (id, lbl) => {
    const isActive = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          flex: 1,
          padding: '10px 0',
          border: 'none',
          cursor: 'pointer',
          fontFamily: OUTFIT,
          fontSize: 13,
          fontWeight: 700,
          background: 'transparent',
          color: isActive ? AMBER_DK : MUTED,
          borderBottom: `2px solid ${isActive ? AMBER : BORDER}`,
          transition: 'all 0.15s',
          letterSpacing: '0.02em',
        }}
      >
        {lbl}
      </button>
    );
  };

  const canLogin = loginEmail.trim() && loginPassword && !loginLoading;
  const canReg   = regCompany.trim() && regEmail.trim() && regPassword && !regLoading;

  return (
    <>
      <style>{`
        @media (max-width: 768px) { .login-hero { display: none !important; } }
      `}</style>
      <div style={{ fontFamily: OUTFIT, minHeight: '100vh', display: 'flex', background: BG }}>

        {/* ── Left editorial hero ── */}
        <div className="login-hero" style={{ display: 'flex', flex: '0 0 56%' }}>
          <HeroPanel lang={lang} />
        </div>

        {/* ── Right form panel ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 36px',
          background: WHITE,
          overflowY: 'auto',
          minHeight: '100vh',
          borderLeft: `1px solid ${BORDER}`,
        }}>
          <div style={{ width: '100%', maxWidth: 360 }}>

            {/* Lang toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
              <div style={{
                display: 'flex', gap: 2,
                background: BG, borderRadius: 8, padding: 3,
                border: `1px solid ${BORDER}`,
              }}>
                {['en', 'sv'].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    style={{
                      fontFamily: OUTFIT, fontSize: 11, fontWeight: 700,
                      background: lang === l ? AMBER : 'transparent',
                      color: lang === l ? '#17161a' : MUTED,
                      border: 'none',
                      borderRadius: 6,
                      padding: '5px 13px',
                      cursor: 'pointer',
                      transition: 'all 0.15s cubic-bezier(0.22,1,0.36,1)',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Heading */}
            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontFamily: OUTFIT, fontWeight: 800, fontSize: 26,
                color: TEXT, marginBottom: 6,
                letterSpacing: '-0.02em', lineHeight: 1.2,
              }}>
                {tab === 'login' ? t.login.signIn : t.login.register}
              </div>
              <p style={{ fontFamily: OUTFIT, fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.5 }}>
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
                        fontFamily: OUTFIT, fontSize: 11, fontWeight: 600, color: MUTED, padding: 0,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {showPassword ? t.login.hide : t.login.show}
                    </button>
                  </div>
                </Field>

                {loginError && (
                  <div style={{
                    background: 'rgba(244,63,94,0.06)',
                    border: '1px solid rgba(244,63,94,0.25)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#be123c',
                    fontSize: 13,
                    fontFamily: OUTFIT,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="#be123c" strokeWidth="1.3" />
                      <path d="M7 4v3.5M7 9.5v.5" stroke="#be123c" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    {t.login.wrongCreds}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canLogin}
                  style={{
                    fontFamily: OUTFIT,
                    width: '100%',
                    fontWeight: 800,
                    fontSize: 13,
                    padding: '13px',
                    borderRadius: 9,
                    border: 'none',
                    marginTop: 4,
                    letterSpacing: '0.06em',
                    background: canLogin
                      ? `linear-gradient(135deg, ${AMBER} 0%, #d4b55e 100%)`
                      : '#ddd9d2',
                    color: canLogin ? '#17161a' : '#a09aa8',
                    cursor: canLogin ? 'pointer' : 'not-allowed',
                    boxShadow: canLogin ? '0 3px 14px rgba(201,168,76,0.32)' : 'none',
                    transition: 'transform 0.15s cubic-bezier(0.22,1,0.36,1), box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { if (canLogin) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(201,168,76,0.40)'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = canLogin ? '0 3px 14px rgba(201,168,76,0.32)' : 'none'; }}
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
                    background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.25)',
                    borderRadius: 8, padding: '10px 14px', color: '#be123c',
                    fontSize: 13, fontFamily: OUTFIT,
                  }}>
                    {regError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canReg}
                  style={{
                    fontFamily: OUTFIT, width: '100%', fontWeight: 800, fontSize: 13,
                    padding: '13px', borderRadius: 9, border: 'none', marginTop: 4,
                    letterSpacing: '0.06em',
                    background: canReg
                      ? `linear-gradient(135deg, ${AMBER} 0%, #d4b55e 100%)`
                      : '#ddd9d2',
                    color: canReg ? '#17161a' : '#a09aa8',
                    cursor: canReg ? 'pointer' : 'not-allowed',
                    boxShadow: canReg ? '0 3px 14px rgba(201,168,76,0.32)' : 'none',
                    transition: 'transform 0.15s cubic-bezier(0.22,1,0.36,1), box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { if (canReg) { e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {regLoading ? t.login.creating : t.login.createBtn}
                </button>

                <p style={{ fontSize: 11, color: '#b0aab8', margin: 0, textAlign: 'center', lineHeight: 1.6, fontFamily: OUTFIT }}>
                  {t.login.setupNote}
                </p>
              </form>
            )}

            <div style={{
              fontSize: 11, color: '#c8c3d0', textAlign: 'center',
              marginTop: 28, lineHeight: 1.6, fontFamily: OUTFIT,
            }}>
              {t.login.pricing}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
