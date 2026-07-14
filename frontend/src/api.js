const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const STORAGE_KEY = "heatsight_auth";

/**
 * Drop-in replacement for fetch() qui ajoute automatiquement
 * le header Authorization: Bearer <token> si l'utilisateur est connecté.
 *
 * Usage : apiFetch("/projects") au lieu de fetch(`${API_URL}/projects`)
 */
export async function apiFetch(path, options = {}) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const token = stored ? JSON.parse(stored).token : null;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // Token invalide ou expiré : on purge la session et on renvoie au login
  // (évite les boucles de 401 sur une interface qui se croit connectée).
  if (res.status === 401 && token) {
    localStorage.removeItem(STORAGE_KEY);
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }

  return res;
}
