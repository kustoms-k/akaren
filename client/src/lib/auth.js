import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/** login('', '') is the demo login. { status: 'checking' | 'anonymous' | 'authenticated', user, company, login, logout, setCompanyName } */
export const useAuth = () => useContext(AuthContext);
