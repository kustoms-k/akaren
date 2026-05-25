import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LogoFull, LogoMark } from '../assets/Logo.jsx';

const INTER   = "'Inter', 'Outfit', system-ui, sans-serif";
const MONO    = "'DM Mono', monospace";
const CYAN    = '#5eead4';
const CYAN_BR = '#2dd4bf';
const VIOLET  = '#a78bfa';
const SUCCESS = '#4ade80';
const DANGER  = '#f87171';
const AMBER   = '#c9921e';
const BG_BASE = '#080b14';
const TEXT_PR = '#e8edf5';
const TEXT_SEC= '#8b97ad';
const TEXT_MU = '#5a6478';
const BORDER  = 'rgba(255,255,255,0.06)';


function inputStyle(focused, error) {
  return {
    fontFamily: INTER,
    width: '100%',
    padding: '11px 14px',
    border: `1px solid ${error ? 'rgba(248,113,113,0.5)' : focused ? 'rgba(94,234,212,0.5)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 10,
    fontSize: 14,
    color: TEXT_PR,
    background: focused ? 'rgba(20,27,45,0.9)' : 'rgba(20,27,45,0.7)',
    outline: 'none',
    boxSizing: 'border-box',
    boxShadow: focused ? '0 0 0 3px rgba(94,234,212,0.08)' : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
  };
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, color: TEXT_MU, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FocusInput({ type = 'text', value, onChange, placeholder, autoFocus, error }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      autoFocus={autoFocus}
      style={inputStyle(focused, error)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ── Feature list icons (SVG only) ────────────────────────────────────────────
function IconAI() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="rgba(94,234,212,0.5)" strokeWidth="1.2" />
      <path d="M5 8.5L7 10.5L11 6" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 10L10 6M7 5.5H4.5a2 2 0 000 4h1M9 10.5h2.5a2 2 0 000-4H9" stroke={CYAN} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="9" width="2.5" height="4" rx="1" fill={CYAN} opacity="0.7" />
      <rect x="6.75" y="6" width="2.5" height="7" rx="1" fill={CYAN} />
      <rect x="10.5" y="3" width="2.5" height="10" rx="1" fill={CYAN} opacity="0.7" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L3 4.5v4C3 11.5 5.5 14 8 14s5-2.5 5-5.5v-4L8 2z" stroke={CYAN} strokeWidth="1.3" strokeLinejoin="round" fill="none" />
      <path d="M6 8l1.5 1.5L10 6.5" stroke={CYAN} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
      flex: '0 0 54%',
      background: 'rgba(8,11,20,0.95)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '56px 52px',
      minHeight: '100%',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute', top: '-20%', left: '-10%',
        width: '60%', height: '60%',
        background: 'radial-gradient(circle, rgba(94,234,212,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 36 }}>
          <LogoMark size={60} glow />
        </div>

        <div style={{
          fontFamily: INTER,
          fontWeight: 800,
          fontSize: 38,
          letterSpacing: '0.08em',
          background: 'linear-gradient(135deg, #5eead4, #ffffff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1,
          marginBottom: 6,
        }}>
          ÅKAREN
        </div>
        <div style={{
          fontFamily: MONO,
          fontWeight: 400,
          fontSize: 10,
          letterSpacing: '0.22em',
          color: TEXT_MU,
          marginBottom: 28,
          textTransform: 'uppercase',
        }}>
          TRANSPORTHANTERING
        </div>

        {/* Cyan divider */}
        <div style={{
          width: 40, height: 2,
          background: `linear-gradient(90deg, ${CYAN} 0%, transparent 100%)`,
          marginBottom: 28,
        }} />

        <p style={{
          fontFamily: INTER,
          fontSize: 16,
          color: TEXT_SEC,
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
                borderRadius: 8,
                background: 'rgba(94,234,212,0.1)',
                border: '1px solid rgba(94,234,212,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <f.Icon />
              </div>
              <span style={{
                fontFamily: INTER,
                fontSize: 13,
                color: TEXT_SEC,
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
          fontFamily: INTER,
          fontSize: 10,
          color: TEXT_MU,
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
          borderBottom: `2px solid ${isActive ? CYAN : 'rgba(255,255,255,0.08)'}`,
          cursor: 'pointer',
          fontFamily: INTER,
          fontSize: 13,
          fontWeight: 700,
          background: 'transparent',
          color: isActive ? CYAN : TEXT_MU,
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
      <div style={{ fontFamily: INTER, minHeight: '100vh', display: 'flex', background: 'radial-gradient(circle at 50% 0%, #0d1424 0%, #080b14 60%)' }}>

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
          background: 'rgba(14,20,36,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          overflowY: 'auto',
          minHeight: '100vh',
        }}>
          <div style={{ width: '100%', maxWidth: 360 }}>

            {/* Lang toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
              <div style={{
                display: 'flex', gap: 2,
                background: 'rgba(20,27,45,0.8)', borderRadius: 10, padding: 3,
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                {['en', 'sv'].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    style={{
                      fontFamily: INTER, fontSize: 11, fontWeight: 700,
                      background: lang === l ? CYAN : 'transparent',
                      color: lang === l ? '#080b14' : TEXT_MU,
                      border: 'none',
                      borderRadius: 7,
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
                fontFamily: INTER, fontWeight: 700, fontSize: 26,
                color: TEXT_PR, marginBottom: 6,
                letterSpacing: '-0.02em', lineHeight: 1.2,
              }}>
                {tab === 'login' ? t.login.signIn : t.login.register}
              </div>
              <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, margin: 0, lineHeight: 1.5 }}>
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
                    error={loginError}
                  />
                </Field>

                <Field label={t.login.password}>
                  <div style={{ position: 'relative' }}>
                    <FocusInput
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      error={loginError}
                    />
                    <button
                      type="button" tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: INTER, fontSize: 11, fontWeight: 600, color: TEXT_MU, padding: 0,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {showPassword ? t.login.hide : t.login.show}
                    </button>
                  </div>
                </Field>

                {loginError && (
                  <div style={{
                    background: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.25)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: DANGER,
                    fontSize: 13,
                    fontFamily: INTER,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke={DANGER} strokeWidth="1.3" />
                      <path d="M7 4v3.5M7 9.5v.5" stroke={DANGER} strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    {t.login.wrongCreds}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canLogin}
                  style={{
                    fontFamily: INTER,
                    width: '100%',
                    fontWeight: 700,
                    fontSize: 13,
                    padding: '13px',
                    borderRadius: 10,
                    border: 'none',
                    marginTop: 4,
                    letterSpacing: '0.04em',
                    background: canLogin
                      ? `linear-gradient(135deg, ${CYAN_BR} 0%, ${CYAN} 100%)`
                      : 'rgba(255,255,255,0.06)',
                    color: canLogin ? '#080b14' : TEXT_MU,
                    cursor: canLogin ? 'pointer' : 'not-allowed',
                    boxShadow: canLogin ? '0 0 20px rgba(94,234,212,0.3)' : 'none',
                    transition: 'transform 0.15s cubic-bezier(0.22,1,0.36,1), box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { if (canLogin) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(94,234,212,0.45)'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = canLogin ? '0 0 20px rgba(94,234,212,0.3)' : 'none'; }}
                >
                  {loginLoading ? t.login.signingIn : t.login.signInBtn}
                </button>

                {/* Quick-access bypass */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU, letterSpacing: '0.05em' }}>ELLER</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setLoginLoading(true);
                    setLoginError(false);
                    try {
                      const res  = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: 'admin@kemoffs.se', password: 'admin123' }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error();
                      login(data);
                    } catch {
                      setLoginError(true);
                    } finally {
                      setLoginLoading(false);
                    }
                  }}
                  disabled={loginLoading}
                  style={{
                    fontFamily: INTER,
                    width: '100%',
                    fontWeight: 500,
                    fontSize: 13,
                    padding: '11px',
                    borderRadius: 10,
                    border: '1px solid rgba(94,234,212,0.25)',
                    background: 'transparent',
                    color: CYAN,
                    cursor: loginLoading ? 'not-allowed' : 'pointer',
                    letterSpacing: '0.03em',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!loginLoading) { e.currentTarget.style.borderColor = CYAN; e.currentTarget.style.background = 'rgba(94,234,212,0.05)'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(94,234,212,0.25)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  Bypass — direktåtkomst
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
                    background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
                    borderRadius: 10, padding: '10px 14px', color: DANGER,
                    fontSize: 13, fontFamily: INTER,
                  }}>
                    {regError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canReg}
                  style={{
                    fontFamily: INTER, width: '100%', fontWeight: 700, fontSize: 13,
                    padding: '13px', borderRadius: 10, border: 'none', marginTop: 4,
                    letterSpacing: '0.04em',
                    background: canReg
                      ? `linear-gradient(135deg, ${CYAN_BR} 0%, ${CYAN} 100%)`
                      : 'rgba(255,255,255,0.06)',
                    color: canReg ? '#080b14' : TEXT_MU,
                    cursor: canReg ? 'pointer' : 'not-allowed',
                    boxShadow: canReg ? '0 0 20px rgba(94,234,212,0.3)' : 'none',
                    transition: 'transform 0.15s cubic-bezier(0.22,1,0.36,1), box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { if (canReg) { e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {regLoading ? t.login.creating : t.login.createBtn}
                </button>

                <p style={{ fontSize: 11, color: TEXT_MU, margin: 0, textAlign: 'center', lineHeight: 1.6, fontFamily: INTER }}>
                  {t.login.setupNote}
                </p>
              </form>
            )}

            <div style={{
              fontSize: 11, color: TEXT_MU, textAlign: 'center',
              marginTop: 28, lineHeight: 1.6, fontFamily: INTER,
            }}>
              {t.login.pricing}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
