import { useEffect, useMemo, useState } from "react";
import { Users, ShieldCheck } from "lucide-react";
import { apiFetch } from "../api";
import { useAuth } from "../state/AuthContext";

const PLAN_LABELS = { trial: "Essai gratuit", annual: "Annuel", triennial: "3 ans" };
const STATUS_LABELS = {
  trialing: "Essai en cours",
  pending: "En attente de facturation",
  active: "Actif",
  expired: "Expiré",
};

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: "white", borderRadius: 16, padding: "18px 20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
      <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent || "#111827", lineHeight: 1.1, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [oRes, uRes] = await Promise.all([apiFetch("/admin/overview"), apiFetch("/admin/users")]);
      if (!oRes.ok || !uRes.ok) throw new Error(`Erreur ${oRes.status}/${uRes.status}`);
      setOverview(await oRes.json());
      setUsers(await uRes.json());
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleAdmin(u) {
    setSavingId(u.id);
    try {
      const res = await apiFetch(`/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: !u.is_admin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Erreur ${res.status}`);
      }
      const updated = await res.json();
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingId(null);
    }
  }

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
    [users]
  );

  const th = { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" };
  const td = { padding: "12px 12px", fontSize: 13.5 };

  return (
    <div style={{ maxWidth: 1200, width: "100%" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Back-office</div>
      <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827", display: "flex", alignItems: "center", gap: 10 }}>
        <ShieldCheck size={26} color="#59169c" /> Administration
      </h1>
      <div style={{ color: "#6b7280", marginBottom: 24 }}>
        Vue d'ensemble des utilisateurs et de leurs abonnements.
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Aperçu */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard label="Utilisateurs" value={loading ? "—" : overview?.total_users ?? 0} />
        <StatCard label="Essais en cours" value={loading ? "—" : overview?.trial ?? 0} accent="#fe9300" />
        <StatCard label="Annuels" value={loading ? "—" : overview?.annual ?? 0} accent="#59169c" />
        <StatCard label="3 ans" value={loading ? "—" : overview?.triennial ?? 0} accent="#82137e" />
        <StatCard label="En attente" value={loading ? "—" : overview?.pending ?? 0} accent="#ca2946" />
        <StatCard label="Admins" value={loading ? "—" : overview?.admins ?? 0} accent="#059669" />
      </div>

      {/* Note paiements */}
      <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", color: "#59169c", borderRadius: 12, padding: "12px 16px", fontSize: 13, marginBottom: 20 }}>
        💳 Les <b>paiements en ligne</b> (montants, factures) seront disponibles ici une fois la facturation branchée. Pour l'instant : abonnements et statuts.
      </div>

      {/* Utilisateurs */}
      <div style={{ background: "white", borderRadius: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={17} color="#59169c" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#111827" }}>Utilisateurs</h2>
        </div>
        {loading ? (
          <div style={{ padding: "16px 20px", color: "#6b7280" }}>Chargement…</div>
        ) : sortedUsers.length === 0 ? (
          <div style={{ padding: "16px 20px", color: "#6b7280" }}>Aucun utilisateur.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderTop: "1px solid #f3f4f6", borderBottom: "1px solid #f3f4f6" }}>
                  {["Utilisateur", "Entreprise", "Plan", "Statut", "Échéance", "Admin"].map((c) => (
                    <th key={c} style={th}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => (
                  <tr key={u.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: "#111827" }}>{u.full_name}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{u.email}</div>
                    </td>
                    <td style={{ ...td, color: "#374151" }}>{u.company_name || "—"}</td>
                    <td style={{ ...td, color: "#374151" }}>{PLAN_LABELS[u.plan] || "—"}</td>
                    <td style={{ ...td, color: "#374151" }}>{STATUS_LABELS[u.subscription_status] || "—"}</td>
                    <td style={{ ...td, color: "#6b7280" }}>
                      {u.plan === "trial" ? formatDate(u.trial_ends_at) : formatDate(u.current_period_end)}
                    </td>
                    <td style={td}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: u.id === user?.id ? "not-allowed" : "pointer", opacity: savingId === u.id ? 0.5 : 1 }}
                        title={u.id === user?.id ? "Vous ne pouvez pas retirer votre propre accès admin" : "Donner / retirer l'accès admin"}>
                        <input
                          type="checkbox"
                          checked={!!u.is_admin}
                          disabled={savingId === u.id || u.id === user?.id}
                          onChange={() => toggleAdmin(u)}
                          style={{ cursor: "pointer", accentColor: "#59169c" }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: u.is_admin ? "#59169c" : "#9ca3af" }}>
                          {u.is_admin ? "Admin" : "—"}
                        </span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
