import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken, onUnauthorized } from '../lib/api.js';
import { AuthContext } from '../lib/auth.js';

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => ({ status: getToken() ? 'checking' : 'anonymous', user: null, company: null }));

  const logout = useCallback(() => {
    setToken(null);
    setState({ status: 'anonymous', user: null, company: null });
  }, []);

  useEffect(() => onUnauthorized(logout), [logout]);

  // Validate a stored token on load.
  useEffect(() => {
    if (state.status !== 'checking') return;
    api('/api/auth/me')
      .then(({ user, company }) => setState({ status: 'authenticated', user, company }))
      .catch(() => logout());
  }, [state.status, logout]);

  const login = useCallback(async (email, password) => {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setState({ status: 'authenticated', user: data.user, company: data.company });
  }, []);

  const setCompanyName = useCallback((name) => {
    setState((s) => ({ ...s, company: s.company ? { ...s.company, name } : s.company }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setCompanyName }}>
      {children}
    </AuthContext.Provider>
  );
}
