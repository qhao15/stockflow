import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY, getToken, setToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

// Only allow same-site paths, so ?redirect= can't send users to another website.
export function safeRedirect(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

// Sign-in, register and logout do a full page load, so every page and all
// in-memory state start fresh for the new session.
function reloadTo(path) {
  window.location.replace(path);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // True until we know whether a saved token is still valid.
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  // returnHere: after an expired session, signing in again brings the user back to this page.
  const logout = useCallback((returnHere = false) => {
    setToken(null);
    const here = window.location.pathname + window.location.search;
    const keep = returnHere && here !== '/' && !here.startsWith('/login');
    reloadTo(keep ? `/login?redirect=${encodeURIComponent(here)}` : '/login');
  }, []);

  useEffect(() => {
    const expireSession = () => logout(true);
    setUnauthorizedHandler(expireSession);
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(expireSession)
      .finally(() => setLoading(false));
  }, [logout]);

  // Signing in or out in another tab refreshes this one too.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === TOKEN_KEY) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback(async (email, password, redirectTo) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.data.token);
    reloadTo(safeRedirect(redirectTo));
  }, []);

  const register = useCallback(async (name, email, password, redirectTo) => {
    const res = await api.post('/auth/register', { name, email, password });
    setToken(res.data.token);
    reloadTo(safeRedirect(redirectTo));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
