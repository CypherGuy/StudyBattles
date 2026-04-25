const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default API_BASE;

export function apiFetch(url, options = {}) {
  return fetch(url, options);
}
