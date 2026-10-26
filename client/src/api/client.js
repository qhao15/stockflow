import axios from 'axios';

export const TOKEN_KEY = 'stockflow.token';

// Vite proxies /api to the Node server (see vite.config.js).
const api = axios.create({ baseURL: '/api' });

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable - the session just won't survive a reload
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired or revoked token on any request logs the user out.
// Login/register failures are excluded - they are shown on the form instead.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthForm = /\/auth\/(login|register)$/.test(err.config?.url ?? '');
    if (err.response?.status === 401 && !isAuthForm) onUnauthorized();
    return Promise.reject(err);
  }
);

export function errorMessage(err, fallback = 'Something went wrong') {
  return err.response?.data?.message ?? (err.response ? fallback : 'Cannot reach the server');
}

export default api;
