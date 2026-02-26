# Heat Sight — Frontend

Application web de gestion d'audits énergétiques. Interface SaaS construite avec React + Vite.

## Lancer le projet

```bash
npm install
npm run dev
```

L'app tourne sur `http://localhost:5173`. Le backend FastAPI doit tourner sur `http://127.0.0.1:8000`.

## Authentification (mock MVP)

| Champ | Valeur |
|-------|--------|
| Email | `admin@heatsight.be` |
| Mot de passe | `heatsight2024` |

La session est stockée dans `localStorage` sous la clé `heatsight_auth`. Toutes les routes sont protégées — une redirection vers `/login` s'effectue si non connecté.

---

## Structure du projet

```
src/
├── layout/
│   └── AppLayout.jsx          # Layout principal : sidebar + contenu scrollable
├── pages/
│   ├── Login.jsx              # Page de connexion
│   ├── Dashboard.jsx          # Tableau de bord
│   ├── Projects.jsx           # Liste des projets
│   ├── Agenda.jsx             # Agenda
│   ├── ProjectAudit.jsx       # Module audit (par projet)
│   ├── ProjectEnergy.jsx      # Comptabilité énergie (par projet)
│   ├── ProjectReport.jsx      # Rapport (par projet)
│   ├── ClientRequests.jsx     # Requêtes client (global)
│   └── ShareAccess.jsx        # Partage & Accès (global)
├── ui/
│   ├── Sidebar.jsx            # Sidebar avec navigation + avatar utilisateur
│   └── RequireAuth.jsx        # Guard de route (redirige si non connecté)
└── state/
    ├── AuthContext.jsx        # Contexte authentification
    └── ProjectContext.jsx     # Contexte projet sélectionné (persisté en localStorage)
```

---

## Modules

### Gestion & Administration

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Vue d'ensemble des projets |
| `/projects` | Projets | Liste et gestion des projets (double-clic pour ouvrir) |
| `/agenda` | Agenda | Calendrier des interventions |
| `/share-access` | Partage & Accès | Gestion des accès collaborateurs et clients |

### Collecte de données

| Route | Page | Description |
|-------|------|-------------|
| `/client-requests` | Requêtes client | Envoi et suivi des demandes de documents clients |

### Modules projet (nécessitent un projet sélectionné)

| Route | Page | Description |
|-------|------|-------------|
| `/projects/:id/audit` | Audit | Formulaire d'audit énergétique |
| `/projects/:id/energy` | Comptabilité énergie | Saisie et visualisation des consommations |
| `/projects/:id/report` | Rapport | Génération du rapport d'audit |

---

## Navigation et état

- **Projet actif** : sélectionné par double-clic dans la page Projets, persisté dans `localStorage` (`heatsight_selected_project_id`). Les modules projet apparaissent dans la sidebar uniquement quand un projet est ouvert.
- **Routes globales** (`/client-requests`, `/share-access`, `/agenda`) : accessibles indépendamment du projet sélectionné — le projet reste ouvert dans la sidebar.

## Layout

```
┌──────────────────────────────────────────────┐
│  Sidebar (240px, fixe, fond sombre)          │
│  ├─ Logo Heat Sight                          │  ┌─────────────────────────┐
│  ├─ Gestion & Administration                 │  │  Contenu (flex: 1,      │
│  │   ├─ Tableau de bord                      │  │  overflow-y: auto,      │
│  │   ├─ Projets                              │  │  padding: 24px)         │
│  │   ├─ Agenda                               │  │                         │
│  │   └─ Partage & Accès                      │  │  <Outlet />             │
│  ├─ Collecte de données                      │  │                         │
│  │   └─ Requête client                       │  └─────────────────────────┘
│  ├─ [si projet ouvert]                       │
│  │   ├─ Audit                                │
│  │   ├─ Comptabilité énergie                 │
│  │   └─ Rapport                              │
│  └─ Avatar utilisateur (épinglé en bas)      │
└──────────────────────────────────────────────┘
```

## Stack technique

- **React 18** + **Vite**
- **React Router DOM v7** — routing côté client
- **Lucide React** — icônes
- Styles 100% inline (pas de CSS framework)
- Données mock pour les modules sans API connectée
