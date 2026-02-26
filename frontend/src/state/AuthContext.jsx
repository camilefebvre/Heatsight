import { createContext, useContext, useState } from "react";

const STORAGE_KEY = "heatsight_auth";
const VALID_EMAIL = "admin@heatsight.be";
const VALID_PASSWORD = "heatsight2024";
const USER = { name: "Admin HeatSight", email: VALID_EMAIL };

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  function login(email, password) {
    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(USER));
      setUser(USER);
      return true;
    }
    return false;
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
