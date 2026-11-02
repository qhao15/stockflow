import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { TOKEN_KEY, getToken, setToken, setUnauthorizedHandler } from '../lib/api';
import { setFlash } from '../lib/flash';

const AuthContext = createContext(null);

// How long to keep trying when the server can't be reached, e.g. while it's starting.
const SESSION_CHECK_ATTEMPTS = 20;
const SESSION_CHECK_DELAY_MS = 1000;

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
  // The saved login couldn't be checked because the server didn't answer.
  const [serverDown, setServerDown] = useState(false);
  const sessionCheck = useRef(0);

  // returnHere: after an expired session, signing in again brings the user back to this page.
  const logout = useCallback((returnHere = false) => {
    setToken(null);
    const here = window.location.pathname + window.location.search;
    const keep = returnHere && here !== '/' && !here.startsWith('/login');
    reloadTo(keep ? `/login?redirect=${encodeURIComponent(here)}` : '/login');
  }, []);

  // Checks the saved login. Only a 401 means it's no longer valid (the API client then logs
  // out). Any other failure says nothing about the login, usually the server is restarting,
  // so keep the token and try again.
  const restoreSession = useCallback(async () => {
    sessionCheck.current += 1;
    const check = sessionCheck.current;
    setLoading(true);
    setServerDown(false);
    for (let attempt = 1; attempt <= SESSION_CHECK_ATTEMPTS; attempt += 1) {
      try {
        const res = await api.get('/auth/me');
        if (check === sessionCheck.current) {
          setUser(res.data.user);
          setLoading(false);
        }
        return;
      } catch (err) {
        if (err.response?.status === 401 || check !== sessionCheck.current) return;
        await new Promise((resolve) => setTimeout(resolve, SESSION_CHECK_DELAY_MS));
      }
    }
    if (check === sessionCheck.current) {
      setServerDown(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout(true));
    if (getToken()) restoreSession();
  }, [logout, restoreSession]);

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
    setFlash(`Account created. Welcome to StockFlow, ${res.data.user.name}!`);
    reloadTo(safeRedirect(redirectTo));
  }, []);

  // After editing the own account: the server returns the updated user and, after a
  // password change, a new token (the old one stops working).
  const updateSession = useCallback(({ token, user: updated }) => {
    if (token) setToken(token);
    setUser(updated);
  }, []);

  // The permission list comes from the server. This only decides what to show;
  // the API checks every request again.
  const can = useCallback(
    (permission) => !permission || Boolean(user?.permissions?.includes(permission)),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, serverDown, restoreSession, login, register, logout, can, updateSession }),
    [user, loading, serverDown, restoreSession, login, register, logout, can, updateSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
