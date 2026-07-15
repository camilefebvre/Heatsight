import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { apiFetch } from "../api";

const BRAND = "#59169c";

const OFFERS = [
  {
    id: "trial",
    name: "Essai gratuit",
    price: "0 €",
    period: "pendant 1 mois",
    subtitle: "Testez toutes les fonctionnalités sans engagement.",
    features: [
      "Accès complet pendant 30 jours",
      "Projets, audits, ACV et rapports",
      "Aucune carte bancaire requise",
    ],
    cta: "Démarrer l'essai",
    highlighted: false,
  },
  {
    id: "annual",
    name: "Abonnement annuel",
    price: "1 500 € HT",
    period: "par an",
    subtitle: "L'offre standard, facturée chaque année.",
    features: [
      "Accès complet à la plateforme",
      "Projets illimités",
      "Support par email",
    ],
    cta: "Choisir l'annuel",
    highlighted: false,
  },
  {
    id: "triennial",
    name: "Abonnement 3 ans",
    price: "3 900 € HT",
    period: "pour 3 ans",
    subtitle: "Soit 1 300 € / an — vous économisez 600 € (−13 %).",
    features: [
      "Tout de l'offre annuelle",
      "Tarif bloqué pendant 3 ans",
      "Support prioritaire",
    ],
    cta: "Choisir 3 ans",
    highlighted: true,
  },
];

const PLAN_LABELS = {
  trial: "Essai gratuit",
  annual: "Abonnement annuel",
  triennial: "Abonnement 3 ans",
};

const STATUS_LABELS = {
  trialing: "Essai en cours",
  pending: "En attente de facturation",
  active: "Actif",
  expired: "Expiré",
};

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

export default function Abonnement() {
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function loadSubscription() {
    try {
      const res = await apiFetch("/subscription");
      if (!res.ok) throw new Error(`GET /subscription (${res.status})`);
      setSub(await res.json());
    } catch (e) {
      setError(e.message || "Impossible de charger l'abonnement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubscription();
  }, []);

  async function handleSelect(planId) {
    setError(null);
    setNotice(null);
    setSelecting(planId);
    try {
      const res = await apiFetch("/subscription/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erreur lors de la sélection de l'offre");
      }
      setSub(await res.json());
      setNotice(
        planId === "trial"
          ? "Votre essai gratuit a démarré. Profitez-en pendant 30 jours !"
          : "Offre enregistrée. Nous vous recontactons pour la facturation."
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSelecting(null);
    }
  }

  const trialUsed = Boolean(sub?.trial_ends_at);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, color: "#111827", margin: 0 }}>Abonnement</h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginTop: 6 }}>
          Choisissez la formule adaptée à votre activité. Tous les prix sont hors TVA.
        </p>
      </div>

      {/* Bandeau abonnement actuel */}
      {!loading && sub?.plan && (
        <div
          style={{
            background: "white",
            border: `1px solid ${BRAND}22`,
            borderLeft: `4px solid ${BRAND}`,
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 13, color: "#6b7280" }}>Votre offre actuelle</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
              {PLAN_LABELS[sub.plan] || sub.plan}
            </span>
            {sub.subscription_status && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: BRAND,
                  background: `${BRAND}14`,
                  padding: "3px 10px",
                  borderRadius: 999,
                }}
              >
                {STATUS_LABELS[sub.subscription_status] || sub.subscription_status}
              </span>
            )}
            {sub.plan === "trial" && sub.trial_ends_at && (
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                Fin de l'essai le {formatDate(sub.trial_ends_at)}
              </span>
            )}
            {sub.plan !== "trial" && sub.current_period_end && (
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                Jusqu'au {formatDate(sub.current_period_end)}
              </span>
            )}
          </div>
        </div>
      )}

      {notice && (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13.5,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13.5,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Cartes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        {OFFERS.map((offer) => {
          const isCurrent = sub?.plan === offer.id;
          const trialDisabled = offer.id === "trial" && trialUsed && !isCurrent;
          const busy = selecting === offer.id;
          const disabled = busy || isCurrent || trialDisabled;

          return (
            <div
              key={offer.id}
              style={{
                position: "relative",
                background: "white",
                border: offer.highlighted ? `2px solid ${BRAND}` : "1px solid #e5e7eb",
                borderRadius: 16,
                padding: "26px 22px",
                display: "flex",
                flexDirection: "column",
                boxShadow: offer.highlighted ? `0 10px 30px ${BRAND}22` : "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {offer.highlighted && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: 22,
                    background: BRAND,
                    color: "white",
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "4px 11px",
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Sparkles size={13} /> Le plus avantageux
                </div>
              )}

              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: 0 }}>{offer.name}</h2>
              <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "#111827" }}>{offer.price}</span>
                <span style={{ fontSize: 13, color: "#6b7280" }}>{offer.period}</span>
              </div>
              <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8, minHeight: 34 }}>{offer.subtitle}</p>

              <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 20px", display: "grid", gap: 9 }}>
                {offer.features.map((f, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, color: "#374151" }}>
                    <Check size={16} color={BRAND} style={{ flexShrink: 0, marginTop: 1 }} />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelect(offer.id)}
                disabled={disabled}
                style={{
                  marginTop: "auto",
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: 10,
                  border: offer.highlighted ? "none" : `1px solid ${BRAND}`,
                  background: isCurrent ? "#f3f4f6" : offer.highlighted ? BRAND : "white",
                  color: isCurrent ? "#6b7280" : offer.highlighted ? "white" : BRAND,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled && !isCurrent ? 0.55 : 1,
                }}
              >
                {isCurrent
                  ? "Offre actuelle"
                  : trialDisabled
                  ? "Essai déjà utilisé"
                  : busy
                  ? "…"
                  : offer.cta}
              </button>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 20, textAlign: "center" }}>
        Le paiement en ligne sera bientôt disponible. Pour l'instant, la sélection d'une offre payante
        enregistre votre intention et notre équipe vous recontacte pour la facturation.
      </p>
    </div>
  );
}
