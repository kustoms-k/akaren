import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [token,   setToken]   = useState(() => localStorage.getItem('auth_token'));
  const [user,    setUser]    = useState(() => load('auth_user'));
  const [company, setCompany] = useState(() => load('auth_company'));

  // Auto-login with default credentials — dev convenience only, never runs in production
  useEffect(() => {
    if (token) return;
    if (!import.meta.env.DEV) return;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@kemoffs.se', password: 'admin123' }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.token) return;
        localStorage.setItem('auth_token',   data.token);
        localStorage.setItem('auth_user',    JSON.stringify(data.user));
        localStorage.setItem('auth_company', JSON.stringify(data.company));
        setToken(data.token);
        setUser(data.user);
        setCompany(data.company);
      })
      .catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh company (and user role) from server when token exists but company is missing.
  // Handles stale localStorage after a server restart or hard reload.
  useEffect(() => {
    if (!token || company) return;
    fetch('/api/company', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.id) return;
        localStorage.setItem('auth_company', JSON.stringify(data));
        setCompany(data);
      })
      .catch(() => {});
  }, [token, company]);

  const login = useCallback((data) => {
    localStorage.setItem('auth_token',   data.token);
    localStorage.setItem('auth_user',    JSON.stringify(data.user));
    localStorage.setItem('auth_company', JSON.stringify(data.company));
    setToken(data.token);
    setUser(data.user);
    setCompany(data.company);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_company');
    setToken(null);
    setUser(null);
    setCompany(null);
  }, []);

  const updateCompany = useCallback((data) => {
    localStorage.setItem('auth_company', JSON.stringify(data));
    setCompany(data);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem('auth_user', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      token,
      user,
      company,
      isAuthenticated: Boolean(token),
      login,
      logout,
      updateCompany,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
