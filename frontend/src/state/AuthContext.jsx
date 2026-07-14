import { createContext, useContext, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const STORAGE_KEY = "heatsight_auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Valider que la session contient les champs requis par la nouvelle auth
      if (!parsed?.token || !parsed?.name || !parsed?.email) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  });

  async function login(email, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const userData = { ...data.user, name: data.user.full_name, token: data.access_token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    setUser(userData);
    return true;
  }

  async function register(fullName, email, password) {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Erreur lors de l'inscription");
    }
    return true;
  }

  async function updateProfile(fields) {
    const allowed = ["full_name", "email", "avatar", "company_name", "company_logo"];
    const body = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) body[key] = fields[key];
    }
    const res = await fetch(`${API_URL}/auth/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Erreur lors de la mise à jour du profil");
    }
    const data = await res.json();
    const updated = {
      ...user,
      name: data.full_name,
      full_name: data.full_name,
      email: data.email,
      avatar: data.avatar,
      company_name: data.company_name,
      company_logo: data.company_logo,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setUser(updated);
    return true;
  }

  async function changePassword(currentPassword, newPassword) {
    const res = await fetch(`${API_URL}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || "Erreur lors du changement de mot de passe");
    }
    return true;
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
