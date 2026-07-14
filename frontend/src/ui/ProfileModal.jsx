import { useEffect, useState } from "react";
import { useAuth } from "../state/AuthContext";

const label = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#9aa0b4",
  marginBottom: 6,
};

const input = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid #2a2d45",
  background: "#12142a",
  color: "white",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const primaryBtn = {
  padding: "9px 14px",
  borderRadius: 8,
  border: "none",
  background: "#59169c",
  color: "white",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const ghostBtn = {
  padding: "7px 11px",
  borderRadius: 8,
  border: "1px solid #2a2d45",
  background: "transparent",
  color: "#e5e7eb",
  fontWeight: 600,
  fontSize: 12.5,
  cursor: "pointer",
};

const MAX_IMAGE_BYTES = 1024 * 1024; // ~1 Mo

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Le fichier doit être une image."));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error("L'image doit faire moins de 1 Mo."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Impossible de lire le fichier."));
    reader.readAsDataURL(file);
  });
}

function Feedback({ msg }) {
  if (!msg) return null;
  const ok = msg.type === "success";
  return (
    <div
      style={{
        marginTop: 10,
        fontSize: 12.5,
        fontWeight: 600,
        color: ok ? "#4ade80" : "#e16b80",
      }}
    >
      {msg.text}
    </div>
  );
}

export default function ProfileModal({ open, onClose }) {
  const { user, updateProfile, changePassword } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState(null);
  const [profileMsg, setProfileMsg] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState(null);
  const [savingPwd, setSavingPwd] = useState(false);

  // Réinitialise les champs à chaque ouverture
  useEffect(() => {
    if (open && user) {
      setFullName(user.full_name || user.name || "");
      setEmail(user.email || "");
      setAvatar(user.avatar || null);
      setCompanyName(user.company_name || "");
      setCompanyLogo(user.company_logo || null);
      setProfileMsg(null);
      setPwdMsg(null);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    }
  }, [open, user]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      await updateProfile({
        full_name: fullName,
        email,
        avatar: avatar || "",
        company_name: companyName,
        company_logo: companyLogo || "",
      });
      setProfileMsg({ type: "success", text: "Profil mis à jour." });
    } catch (err) {
      setProfileMsg({ type: "error", text: err.message });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePickImage(e, setter) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de re-sélectionner le même fichier
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setter(dataUrl);
      setProfileMsg(null);
    } catch (err) {
      setProfileMsg({ type: "error", text: err.message });
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwdMsg(null);
    if (newPwd.length < 8) {
      setPwdMsg({ type: "error", text: "Le nouveau mot de passe doit faire au moins 8 caractères." });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: "error", text: "Les mots de passe ne correspondent pas." });
      return;
    }
    setSavingPwd(true);
    try {
      await changePassword(currentPwd, newPwd);
      setPwdMsg({ type: "success", text: "Mot de passe modifié." });
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err) {
      setPwdMsg({ type: "error", text: err.message });
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "#1a1d2e",
          border: "1px solid #2a2d45",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "white" }}>Mon profil</h2>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "#6b7280",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Infos personnelles */}
        <form onSubmit={handleSaveProfile}>
          {/* Photo de profil */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "#59169c",
                color: "white",
                fontWeight: 700,
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {avatar ? (
                <img src={avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                (fullName || "?")
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ ...ghostBtn, cursor: "pointer" }}>
                Changer la photo
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => handlePickImage(e, setAvatar)}
                />
              </label>
              {avatar && (
                <button type="button" style={ghostBtn} onClick={() => setAvatar(null)}>
                  Retirer
                </button>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={label}>Nom complet</label>
            <input style={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Email</label>
            <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Nom de l'entreprise</label>
            <input
              style={input}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex. Heat Sight"
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Logo de l'entreprise</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 88,
                  height: 44,
                  borderRadius: 8,
                  border: "1px solid #2a2d45",
                  background: "#12142a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {companyLogo ? (
                  <img src={companyLogo} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                ) : (
                  <span style={{ fontSize: 11, color: "#6b7280" }}>Aucun</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ ...ghostBtn, cursor: "pointer" }}>
                  Choisir un logo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handlePickImage(e, setCompanyLogo)}
                  />
                </label>
                {companyLogo && (
                  <button type="button" style={ghostBtn} onClick={() => setCompanyLogo(null)}>
                    Retirer
                  </button>
                )}
              </div>
            </div>
          </div>
          <button type="submit" style={{ ...primaryBtn, opacity: savingProfile ? 0.6 : 1 }} disabled={savingProfile}>
            {savingProfile ? "Enregistrement…" : "Enregistrer"}
          </button>
          <Feedback msg={profileMsg} />
        </form>

        <div style={{ height: 1, background: "#2a2d45", margin: "22px 0" }} />

        {/* Mot de passe */}
        <form onSubmit={handleChangePassword}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "white" }}>
            Changer le mot de passe
          </h3>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Mot de passe actuel</label>
            <input style={input} type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Nouveau mot de passe</label>
            <input style={input} type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Confirmer le nouveau mot de passe</label>
            <input style={input} type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
          </div>
          <button type="submit" style={{ ...primaryBtn, opacity: savingPwd ? 0.6 : 1 }} disabled={savingPwd}>
            {savingPwd ? "Modification…" : "Modifier le mot de passe"}
          </button>
          <Feedback msg={pwdMsg} />
        </form>
      </div>
    </div>
  );
}
