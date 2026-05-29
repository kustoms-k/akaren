import { useState, useEffect, useRef } from 'react';
import { useAuth }     from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LogoMark }    from '../assets/Logo.jsx';

const INTER       = "'Plus Jakarta Sans', system-ui, sans-serif";
const MONO        = "'Plus Jakarta Sans', system-ui, sans-serif";
const BG_BASE     = '#f4f5f7';
const SURF        = '#ffffff';
const BORDER      = '#ececef';
const TEXT_PR     = '#1a1d24';
const TEXT_SEC    = '#6b7280';
const TEXT_MU     = '#9ca3af';
const ACCENT      = '#2d3340';
const ACCENT_SF   = '#eef0f3';
const D_GREEN     = '#16a34a';
const D_RED       = '#dc2626';
const BANKID_BLUE = '#193E8F';
const SHADOW_CARD = '0 1px 4px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06)';

// ── BankID hint code → Swedish message ───────────────────────────────────────
const HINT_MSG = {
  outstandingTransaction: 'Starta BankID-appen och skanna QR-koden',
  noClient:               'Starta BankID-appen',
  started:                'Söker efter BankID…',
  userSign:               'Skriv in din säkerhetskod i BankID-appen',
  expiredTransaction:     'Tidsgränsen nåddes. Försök igen.',
  certificateErr:         'BankID-certifikatet är ogiltigt.',
  userCancel:             'Avbruten av användare.',
  cancelled:              'Inloggningen avbröts.',
  startFailed:            'BankID-appen verkar inte vara installerad.',
};
function hintMsg(code) { return HINT_MSG[code] || 'Starta BankID-appen och skanna QR-koden'; }

// ── Input components ──────────────────────────────────────────────────────────
function inputStyle(focused, error) {
  return {
    fontFamily: INTER, width: '100%', padding: '11px 14px',
    border: `1px solid ${error ? 'rgba(220,38,38,0.45)' : focused ? ACCENT : BORDER}`,
    borderRadius: 10, fontSize: 14, color: TEXT_PR,
    background: focused ? SURF : '#f7f8fa',
    outline: 'none', boxSizing: 'border-box',
    boxShadow: focused ? '0 0 0 3px rgba(45,51,64,0.08)' : 'none',
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
      autoFocus={autoFocus} style={inputStyle(focused, error)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    />
  );
}

// ── BankID icon SVG ───────────────────────────────────────────────────────────
function BankIDIcon({ size = 22, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="11" width="18" height="10" rx="2" stroke={color} strokeWidth="1.6" fill="none"/>
      <path d="M7 11V7a5 5 0 0110 0v4" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="12" cy="16" r="1.5" fill={color}/>
    </svg>
  );
}

// ── Feature icons ─────────────────────────────────────────────────────────────
function IconCalc() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2" width="11" height="12" rx="1.5" stroke="#ffffff" strokeWidth="1.3" fill="none"/><path d="M5 5.5h6M5 8h2M9 8h2M5 10.5h2M9 10.5h2" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function IconLink() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 10L10 6M7 5.5H4.5a2 2 0 000 4h1M9 10.5h2.5a2 2 0 000-4H9" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round"/></svg>;
}
function IconChart() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="9" width="2.5" height="4" rx="1" fill="#ffffff" opacity="0.6"/><rect x="6.75" y="6" width="2.5" height="7" rx="1" fill="#ffffff"/><rect x="10.5" y="3" width="2.5" height="10" rx="1" fill="#ffffff" opacity="0.6"/></svg>;
}
function IconShield() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L3 4.5v4C3 11.5 5.5 14 8 14s5-2.5 5-5.5v-4L8 2z" stroke="#ffffff" strokeWidth="1.3" strokeLinejoin="round" fill="none"/><path d="M6 8l1.5 1.5L10 6.5" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

const FEATURE_ICONS = [IconCalc, IconLink, IconChart, IconShield];

// ── Left hero panel ───────────────────────────────────────────────────────────
function HeroPanel({ t }) {
  const features = t.login.features.map((text, i) => ({ Icon: FEATURE_ICONS[i], text }));
  return (
    <div style={{
      flex: '0 0 54%',
      background: ACCENT,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '56px 52px', minHeight: '100%',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: '-10%', right: '-5%',
        width: '50%', height: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Logo mark */}
        <div style={{
          width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 32,
        }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 22, fontFamily: INTER, letterSpacing: '-0.02em' }}>Å</span>
        </div>

        <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 36, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 4 }}>
          ÅKAREN
        </div>
        <div style={{ fontFamily: MONO, fontWeight: 400, fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.45)', marginBottom: 24, textTransform: 'uppercase' }}>
          TRANSPORTHANTERING
        </div>
        <div style={{ width: 36, height: 2, background: 'rgba(255,255,255,0.3)', borderRadius: 2, marginBottom: 24 }}/>
        <p style={{ fontFamily: INTER, fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, marginBottom: 36, maxWidth: 320, fontWeight: 400, margin: '0 0 36px' }}>
          {t.login.heroTagline}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {features.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <f.Icon />
              </div>
              <span style={{ fontFamily: INTER, fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 400, lineHeight: 1.45 }}>
                {f.text}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 48, fontFamily: INTER, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
          15 000 kr/månad · Obegränsat antal offerter
        </div>
      </div>
    </div>
  );
}

// ── BankID QR card ────────────────────────────────────────────────────────────
function BankIDCard({ qrCode, hintCode, autoStartUrl, onCancel, simulated }) {
  const msg = hintMsg(hintCode);
  const isUserSign = hintCode === 'userSign';

  return (
    <div style={{
      background: BG_BASE, border: `1px solid ${BORDER}`,
      borderRadius: 16, padding: '24px 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    }}>
      {/* BankID header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: BANKID_BLUE,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <BankIDIcon size={18} color="#fff" />
        </div>
        <span style={{ fontFamily: INTER, fontWeight: 700, fontSize: 14, color: TEXT_PR }}>BankID</span>
        {simulated && (
          <span style={{
            fontFamily: MONO, fontSize: 9, color: BANKID_BLUE,
            background: 'rgba(25,62,143,0.10)', border: '1px solid rgba(25,62,143,0.25)',
            borderRadius: 4, padding: '2px 6px', letterSpacing: '0.06em',
          }}>SIM</span>
        )}
      </div>

      {/* QR code */}
      {qrCode && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 10, boxShadow: '0 2px 12px rgba(25,62,143,0.15)' }}>
          <img src={qrCode} alt="BankID QR-kod" style={{ width: 180, height: 180, display: 'block' }} />
        </div>
      )}

      {/* Spinner when waiting for user to sign */}
      {isUserSign && (
        <div style={{ display: 'flex', gap: 5 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%', background: BANKID_BLUE,
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}/>
          ))}
        </div>
      )}

      <p style={{ fontFamily: INTER, fontSize: 13, color: TEXT_SEC, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
        {msg}
      </p>

      {autoStartUrl && (
        <a
          href={autoStartUrl}
          style={{
            fontFamily: INTER, fontSize: 12, fontWeight: 600,
            color: '#fff', background: BANKID_BLUE,
            borderRadius: 9, padding: '9px 18px', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          <BankIDIcon size={15} color="#fff" />
          Öppna BankID-appen
        </a>
      )}

      <button
        onClick={onCancel}
        style={{ fontFamily: INTER, fontSize: 12, fontWeight: 500, color: TEXT_MU, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        Avbryt
      </button>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Main Login component ──────────────────────────────────────────────────────
export function Login() {
  const { login }           = useAuth();
  const { t, lang, setLang } = useLanguage();
  const [tab, setTab]       = useState('login');

  const [loginMode,       setLoginMode]       = useState('bankid-idle');
  const [bankidOrderRef,  setBankidOrderRef]  = useState(null);
  const [bankidQR,        setBankidQR]        = useState(null);
  const [bankidAutoUrl,   setBankidAutoUrl]   = useState(null);
  const [bankidHint,      setBankidHint]      = useState(null);
  const [bankidError,     setBankidError]     = useState(null);
  const [bankidLoading,   setBankidLoading]   = useState(false);
  const [bankidSimulated, setBankidSimulated] = useState(false);
  const pollRef = useRef(null);

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

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => {
    if (loginMode !== 'bankid-qr') { stopPoll(); return; }
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch('/api/auth/bankid/collect', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderRef: bankidOrderRef }),
        });
        const data = await res.json();
        if (data.qrCode)   setBankidQR(data.qrCode);
        if (data.hintCode) setBankidHint(data.hintCode);
        if (data.status === 'complete') {
          stopPoll(); setLoginMode('bankid-success'); setTimeout(() => login(data), 600);
        } else if (data.status === 'no_user') {
          stopPoll(); setBankidError('Ingen behörighet — kontakta din administratör.'); setLoginMode('bankid-error');
        } else if (data.status === 'failed') {
          stopPoll(); setBankidError(hintMsg(data.hintCode)); setLoginMode('bankid-error');
        }
      } catch { /* network blip */ }
    }, 2000);
    return stopPoll;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginMode, bankidOrderRef]);

  async function startBankID() {
    setBankidLoading(true); setBankidError(null);
    try {
      const res  = await fetch('/api/auth/bankid/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'BankID-fel');
      setBankidOrderRef(data.orderRef); setBankidQR(data.qrCode);
      setBankidAutoUrl(data.autoStartUrl); setBankidHint(null);
      setBankidSimulated(data.simulated ?? false); setLoginMode('bankid-qr');
    } catch (err) {
      setBankidError(err.message || 'BankID-tjänsten är inte tillgänglig.'); setLoginMode('bankid-error');
    } finally { setBankidLoading(false); }
  }

  async function cancelBankID() {
    stopPoll(); setLoginMode('bankid-idle'); setBankidQR(null);
    if (bankidOrderRef) {
      fetch('/api/auth/bankid/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderRef: bankidOrderRef }),
      }).catch(() => {});
    }
    setBankidOrderRef(null);
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;
    setLoginLoading(true); setLoginError(false);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      login(data);
    } catch { setLoginError(true); } finally { setLoginLoading(false); }
  }

  async function handleBypass() {
    setLoginLoading(true); setLoginError(false);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@kemoffs.se', password: 'admin123' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      login(data);
    } catch { setLoginError(true); } finally { setLoginLoading(false); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!regCompany.trim() || !regEmail.trim() || !regPassword) return;
    if (regPassword.length < 8) { setRegError(t.login.passwordMin); return; }
    setRegLoading(true); setRegError(null);
    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: regCompany.trim(), org_nr: regOrgNr.trim() || null,
          user_name: regName.trim() || null, user_email: regEmail.trim(), password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Registration failed');
      login(data);
    } catch (err) { setRegError(err.message || 'Registration failed'); } finally { setRegLoading(false); }
  }

  const tabBtn = (id, lbl) => {
    const isActive = tab === id;
    return (
      <button
        onClick={() => { setTab(id); if (id === 'login') setLoginMode('bankid-idle'); }}
        style={{
          flex: 1, padding: '10px 0', border: 'none',
          borderBottom: `2px solid ${isActive ? ACCENT : BORDER}`,
          cursor: 'pointer', fontFamily: INTER, fontSize: 13, fontWeight: 700,
          background: 'transparent', color: isActive ? ACCENT : TEXT_MU,
          transition: 'all 0.15s', letterSpacing: '0.02em',
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
      <style>{`@media (max-width: 768px) { .login-hero { display: none !important; } }`}</style>
      <div style={{ fontFamily: INTER, minHeight: '100vh', display: 'flex', background: BG_BASE }}>

        {/* ── Left hero ── */}
        <div className="login-hero" style={{ display: 'flex', flex: '0 0 52%' }}>
          <HeroPanel t={t} />
        </div>

        {/* ── Right form panel ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px 36px', background: SURF, overflowY: 'auto', minHeight: '100vh',
        }}>
          <div style={{ width: '100%', maxWidth: 360 }}>

            {/* Lang toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 36 }}>
              <div style={{
                display: 'flex', gap: 2,
                background: BG_BASE, borderRadius: 8, padding: 3, border: `1px solid ${BORDER}`,
              }}>
                {['en', 'sv'].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    style={{
                      fontFamily: INTER, fontSize: 11, fontWeight: 700,
                      background: lang === l ? SURF : 'transparent',
                      color: lang === l ? TEXT_PR : TEXT_MU,
                      border: 'none', borderRadius: 5, padding: '4px 12px',
                      cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.06em',
                      boxShadow: lang === l ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Heading */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 24, color: TEXT_PR, marginBottom: 6, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
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

            {/* ── Login tab ── */}
            {tab === 'login' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {loginMode === 'bankid-idle' && (
                  <>
                    <button
                      onClick={startBankID}
                      disabled={bankidLoading}
                      style={{
                        fontFamily: INTER, width: '100%', fontWeight: 700, fontSize: 14,
                        padding: '14px', borderRadius: 12, border: 'none',
                        background: bankidLoading ? 'rgba(25,62,143,0.6)' : BANKID_BLUE,
                        color: '#fff', cursor: bankidLoading ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        boxShadow: bankidLoading ? 'none' : '0 4px 14px rgba(25,62,143,0.35)',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                        letterSpacing: '0.02em',
                      }}
                      onMouseEnter={(e) => { if (!bankidLoading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(25,62,143,0.5)'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = bankidLoading ? 'none' : '0 4px 14px rgba(25,62,143,0.35)'; }}
                    >
                      <BankIDIcon size={20} color="#fff" />
                      {bankidLoading ? 'Startar BankID…' : 'Logga in med BankID'}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: BORDER }}/>
                      <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU, letterSpacing: '0.05em' }}>ELLER</span>
                      <div style={{ flex: 1, height: 1, background: BORDER }}/>
                    </div>

                    <button
                      type="button"
                      onClick={handleBypass}
                      disabled={loginLoading || bankidLoading}
                      style={{
                        fontFamily: INTER, width: '100%', fontWeight: 500, fontSize: 13,
                        padding: '11px', borderRadius: 10,
                        border: `1px solid ${BORDER}`,
                        background: BG_BASE, color: TEXT_SEC,
                        cursor: (loginLoading || bankidLoading) ? 'not-allowed' : 'pointer',
                        letterSpacing: '0.03em', transition: 'border-color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = '#eef0f3'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = BG_BASE; }}
                    >
                      Bypass — direktåtkomst
                    </button>

                    <button
                      onClick={() => setLoginMode('email')}
                      style={{
                        fontFamily: INTER, fontSize: 12, color: TEXT_MU,
                        background: 'none', border: 'none', cursor: 'pointer',
                        textDecoration: 'underline', padding: '4px 0', textDecorationColor: BORDER,
                      }}
                    >
                      Logga in med e-post istället
                    </button>
                  </>
                )}

                {loginMode === 'bankid-qr' && (
                  <BankIDCard
                    qrCode={bankidQR}
                    hintCode={bankidHint}
                    autoStartUrl={bankidAutoUrl}
                    onCancel={cancelBankID}
                    simulated={bankidSimulated}
                  />
                )}

                {loginMode === 'bankid-success' && (
                  <div style={{
                    background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.25)',
                    borderRadius: 16, padding: '32px 24px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ fontSize: 36 }}>✓</div>
                    <p style={{ fontFamily: INTER, fontSize: 14, fontWeight: 600, color: D_GREEN, margin: 0 }}>
                      Inloggning lyckades
                    </p>
                  </div>
                )}

                {loginMode === 'bankid-error' && (
                  <>
                    <div style={{
                      background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)',
                      borderRadius: 12, padding: '14px 16px',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                        <circle cx="8" cy="8" r="6.5" stroke={D_RED} strokeWidth="1.3"/>
                        <path d="M8 5v3.5M8 10.5v.5" stroke={D_RED} strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      <span style={{ fontFamily: INTER, fontSize: 13, color: D_RED, lineHeight: 1.5 }}>{bankidError}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setBankidError(null); setLoginMode('bankid-idle'); }}
                        style={{
                          flex: 1, fontFamily: INTER, fontSize: 12, fontWeight: 600,
                          background: BANKID_BLUE, color: '#fff', border: 'none',
                          borderRadius: 9, padding: '10px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        <BankIDIcon size={14} color="#fff" /> Försök igen
                      </button>
                      <button
                        onClick={() => { setBankidError(null); setLoginMode('email'); }}
                        style={{
                          flex: 1, fontFamily: INTER, fontSize: 12, fontWeight: 500,
                          background: BG_BASE, color: TEXT_SEC, border: `1px solid ${BORDER}`,
                          borderRadius: 9, padding: '10px', cursor: 'pointer',
                        }}
                      >
                        Logga in med e-post
                      </button>
                    </div>
                  </>
                )}

                {loginMode === 'email' && (
                  <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Field label={t.login.email}>
                      <FocusInput type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoFocus error={loginError} />
                    </Field>
                    <Field label={t.login.password}>
                      <div style={{ position: 'relative' }}>
                        <FocusInput
                          type={showPassword ? 'text' : 'password'}
                          value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                          error={loginError}
                        />
                        <button
                          type="button" tabIndex={-1}
                          onClick={() => setShowPassword((v) => !v)}
                          style={{
                            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontFamily: INTER, fontSize: 11, fontWeight: 600, color: TEXT_MU, padding: 0, letterSpacing: '0.04em',
                          }}
                        >
                          {showPassword ? t.login.hide : t.login.show}
                        </button>
                      </div>
                    </Field>

                    {loginError && (
                      <div style={{
                        background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)',
                        borderRadius: 10, padding: '10px 14px', color: D_RED, fontSize: 13, fontFamily: INTER,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <circle cx="7" cy="7" r="6" stroke={D_RED} strokeWidth="1.3"/>
                          <path d="M7 4v3.5M7 9.5v.5" stroke={D_RED} strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        {t.login.wrongCreds}
                      </div>
                    )}

                    <button
                      type="submit" disabled={!canLogin}
                      style={{
                        fontFamily: INTER, width: '100%', fontWeight: 700, fontSize: 13,
                        padding: '13px', borderRadius: 10, border: 'none', marginTop: 2, letterSpacing: '0.04em',
                        background: canLogin ? ACCENT : '#e5e7eb',
                        color: canLogin ? '#ffffff' : TEXT_MU,
                        cursor: canLogin ? 'pointer' : 'not-allowed',
                        boxShadow: canLogin ? '0 4px 12px rgba(45,51,64,0.25)' : 'none',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                      }}
                      onMouseEnter={(e) => { if (canLogin) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(45,51,64,0.35)'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = canLogin ? '0 4px 12px rgba(45,51,64,0.25)' : 'none'; }}
                    >
                      {loginLoading ? t.login.signingIn : t.login.signInBtn}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: BORDER }}/>
                      <span style={{ fontFamily: INTER, fontSize: 11, color: TEXT_MU, letterSpacing: '0.05em' }}>ELLER</span>
                      <div style={{ flex: 1, height: 1, background: BORDER }}/>
                    </div>
                    <button
                      type="button" onClick={handleBypass} disabled={loginLoading}
                      style={{
                        fontFamily: INTER, width: '100%', fontWeight: 500, fontSize: 13,
                        padding: '11px', borderRadius: 10, border: `1px solid ${BORDER}`,
                        background: BG_BASE, color: TEXT_SEC,
                        cursor: loginLoading ? 'not-allowed' : 'pointer',
                        letterSpacing: '0.03em', transition: 'border-color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!loginLoading) { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = '#eef0f3'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = BG_BASE; }}
                    >
                      Bypass — direktåtkomst
                    </button>

                    <button
                      type="button" onClick={() => setLoginMode('bankid-idle')}
                      style={{
                        fontFamily: INTER, fontSize: 12, color: TEXT_MU, background: 'none',
                        border: 'none', cursor: 'pointer', padding: '4px 0',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <BankIDIcon size={13} color={TEXT_MU} />
                      Logga in med BankID istället
                    </button>
                  </form>
                )}
              </div>
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
                    background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)',
                    borderRadius: 10, padding: '10px 14px', color: D_RED, fontSize: 13, fontFamily: INTER,
                  }}>
                    {regError}
                  </div>
                )}
                <button
                  type="submit" disabled={!canReg}
                  style={{
                    fontFamily: INTER, width: '100%', fontWeight: 700, fontSize: 13,
                    padding: '13px', borderRadius: 10, border: 'none', marginTop: 4, letterSpacing: '0.04em',
                    background: canReg ? ACCENT : '#e5e7eb',
                    color: canReg ? '#ffffff' : TEXT_MU,
                    cursor: canReg ? 'pointer' : 'not-allowed',
                    boxShadow: canReg ? '0 4px 12px rgba(45,51,64,0.25)' : 'none',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { if (canReg) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {regLoading ? t.login.creating : t.login.createBtn}
                </button>
                <p style={{ fontSize: 11, color: TEXT_MU, margin: 0, textAlign: 'center', lineHeight: 1.6, fontFamily: INTER }}>
                  {t.login.setupNote}
                </p>
              </form>
            )}

            <div style={{ fontSize: 11, color: TEXT_MU, textAlign: 'center', marginTop: 28, lineHeight: 1.6, fontFamily: INTER }}>
              {t.login.pricing}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
