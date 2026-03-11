const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const STORAGE_KEY = "heatsight_auth";

/**
 * Drop-in replacement for fetch() qui ajoute automatiquement
 * le header Authorization: Bearer <token> si l'utilisateur est connecté.
 *
 * Usage : apiFetch("/projects") au lieu de fetch(`${API_URL}/projects`)
 */
export function apiFetch(path, options = {}) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const token = stored ? JSON.parse(stored).token : null;

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
