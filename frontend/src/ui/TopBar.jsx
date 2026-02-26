import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

function getInitials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  if (!user) return null;

  const initials = getInitials(user.name);

  return (
    <div
      style={{
        height: 56,
        background: "white",
        borderBottom: "1px solid #e9ecf3",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 24px",
        flexShrink: 0,
      }}
    >
      <div ref={containerRef} style={{ position: "relative" }}>
        {/* Avatar */}
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "#6d28d9",
            color: "white",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            letterSpacing: "0.04em",
            boxShadow: open ? "0 0 0 3px #ede9fe" : "none",
            transition: "box-shadow 0.15s",
          }}
          title={user.name}
        >
          {initials}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              background: "white",
              border: "1px solid #e9ecf3",
              borderRadius: 14,
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
              minWidth: 220,
              zIndex: 200,
              overflow: "hidden",
            }}
          >
            {/* Infos utilisateur */}
            <div
              style={{
                padding: "16px 18px 12px",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "#ede9fe",
                    color: "#6d28d9",
                    fontWeight: 700,
                    fontSize: 15,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {user.email}
                  </div>
                </div>
              </div>
            </div>

            {/* Déconnexion */}
            <div style={{ padding: "8px" }}>
              <button
                onClick={handleLogout}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "transparent",
                  color: "#dc2626",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fff1f1")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Se déconnecter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
