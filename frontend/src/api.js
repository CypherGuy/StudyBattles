const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default API_BASE;

export function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem('auth_token');
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(url, { ...options, headers });
}
