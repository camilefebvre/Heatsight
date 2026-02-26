import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const ok = login(email, password);
    if (ok) {
      navigate("/dashboard", { replace: true });
    } else {
      setError("Email ou mot de passe incorrect.");
    }
  }

  const inputStyle = {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #2a2d45",
    background: "#1a1d2e",
    color: "white",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    outline: "none",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f1020",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#161929",
          borderRadius: 20,
          padding: "40px 36px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          border: "1px solid #1e2235",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 32,
          }}
        >
          <img
            src="/logo.png"
            alt="Heat Sight logo"
            style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 8 }}
          />
          <span
            style={{
              fontWeight: 900,
              fontSize: 22,
              color: "white",
              letterSpacing: "-0.5px",
            }}
          >
            Heat Sight
          </span>
        </div>

        <h2
          style={{
            margin: "0 0 6px",
            fontSize: 20,
            fontWeight: 700,
            color: "white",
            textAlign: "center",
          }}
        >
          Connexion
        </h2>
        <p
          style={{
            margin: "0 0 28px",
            fontSize: 14,
            color: "#6b7280",
            textAlign: "center",
          }}
        >
          Accédez à votre espace Heat Sight
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>
              Adresse email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="admin@heatsight.be"
              required
              autoComplete="email"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                background: "#3b1a1a",
                border: "1px solid #7f1d1d",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                color: "#fca5a5",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              marginTop: 4,
              background: "#6d28d9",
              color: "white",
              border: "none",
              padding: "13px",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              width: "100%",
              transition: "background 0.15s",
            }}
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
