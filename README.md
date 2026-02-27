# HeatSight

**HeatSight** est un logiciel modulaire destiné aux **bureaux d'audit énergétique**, conçu pour assister les auditeurs à chaque étape de leur mission : de la **saisie des données de consommation** jusqu'à la **génération de rapports Word**, en passant par l'analyse énergétique multi-annuelle et le calcul d'indices (IEE, IC, iSER…).

Ce dépôt correspond à un **MVP technique** servant de base de développement et d'expérimentation.

---

## Objectif du MVP

- Mettre en place une **architecture monorepo claire** (frontend React + backend FastAPI)
- Couvrir le **workflow complet d'un audit** : création projet → saisie audit → comptabilité énergétique → rapport
- Intégrer un **template Excel** avec calcul automatique d'indices via LibreOffice
- Générer des **rapports Word** à partir d'un template `.docx`
- Persister toutes les données en **base de données PostgreSQL**
- Servir de support pour un projet académique / entrepreneurial

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Python 3.11+, FastAPI, Pydantic v2, openpyxl, docxtpl |
| Frontend | React 18, React Router v7, Vite |
| Calcul Excel | LibreOffice headless (recalcul des formules) |
| Persistance | PostgreSQL + SQLAlchemy 2 (ORM) + Alembic (migrations) |
| Styling | Inline styles (pas de framework CSS) |

---

## Structure du dépôt

```text
HeatSight/
├── backend/
│   ├── app/
│   │   ├── main.py                 # API FastAPI — toutes les routes
│   │   ├── database.py             # Engine SQLAlchemy + get_db()
│   │   ├── models.py               # Modèles ORM (6 tables)
│   │   ├── schemas.py              # Schémas Pydantic (validation / sérialisation)
│   │   ├── templates/
│   │   │   ├── audit_template.xlsx # Template Excel avec formules d'indices
│   │   │   └── report_template.docx# Template Word (variables docxtpl)
│   │   ├── excel/                  # Fichiers Excel générés par projet (UUID.xlsx)
│   │   └── reports/                # Rapports Word générés (UUID_report.docx)
│   ├── migrations/
│   │   ├── versions/
│   │   │   ├── 001_create_projects.py          # Table projects
│   │   │   └── 002_add_module_tables.py        # Tables events, client_requests,
│   │   │                                       #   energy_accounting, audits, reports
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── .env                        # Non versionné — à créer (voir ci-dessous)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── layout/
│   │   │   └── AppLayout.jsx       # Layout principal (sidebar + contenu)
│   │   ├── pages/
│   │   │   ├── Login.jsx           # Page de connexion (mock MVP)
│   │   │   ├── Dashboard.jsx       # Statistiques globales + projets récents
│   │   │   ├── Projects.jsx        # CRUD projets (table + modals)
│   │   │   ├── Agenda.jsx          # Gestion d'événements (persisté en base)
│   │   │   ├── ClientRequests.jsx  # Requêtes client (persisté en base)
│   │   │   ├── ShareAccess.jsx     # Partage & Accès
│   │   │   ├── ProjectAudit.jsx    # Saisie audit (4 onglets, mapping Excel)
│   │   │   ├── ProjectEnergy.jsx   # Comptabilité énergétique multi-annuelle + graphes
│   │   │   └── ProjectReport.jsx   # Génération rapport Word
│   │   ├── state/
│   │   │   ├── AuthContext.jsx     # Contexte authentification
│   │   │   └── ProjectContext.jsx  # Context React — projet sélectionné (persisté localStorage)
│   │   ├── ui/
│   │   │   ├── Sidebar.jsx         # Navigation principale + navigation projet
│   │   │   ├── StatusPill.jsx      # Badge de statut
│   │   │   └── RequireAuth.jsx     # Guard de route
│   │   ├── App.jsx                 # Routing principal
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## Base de données

### Tables

| Table | Description |
|---|---|
| `projects` | Projets d'audit (métadonnées, statut, fichier Excel associé) |
| `events` | Événements agenda (visites, appels, deadlines) |
| `client_requests` | Demandes de documents envoyées aux clients |
| `energy_accounting` | Comptabilité énergétique annuelle par projet |
| `audits` | Données audit par projet (énergies, facteurs d'influence, factures) |
| `reports` | Données rapport par projet (type, thème, auditeur, compétences) |

Les migrations sont gérées avec **Alembic**. Les scripts se trouvent dans `backend/migrations/versions/`.

---

## Fonctionnalités

### Gestion de projets
- Création / édition / suppression de projets d'audit
- Champs : nom, client, email, téléphone, adresse, type de bâtiment, type d'audit, statut
- Statuts : `draft` · `in_progress` · `on_hold` · `completed`
- Double-clic sur un projet → ouvre le module projet dans la sidebar

### Module Audit (`/projects/:id/audit`)
- Saisie des consommations énergétiques par section (Activité op., Bâtiments, Transport, Utilité)
- Colonnes : Électricité, Gaz, Fuel, Biogaz, Utilité 1, Utilité 2, Process
- Noms et unités des utilités personnalisables
- Facteurs d'influence (colonnes L/M/N du template Excel)
- Ligne Factures / Compteur
- Écriture automatique dans l'Excel du projet à la sauvegarde
- Recalcul via LibreOffice headless → lecture des indices calculés (IEE, IC, iSER, AEE, iCO₂, ACO₂)
- Téléchargement du fichier Excel

### Comptabilité énergétique (`/projects/:id/energy`)
- Suivi multi-annuel des consommations
- Import automatique depuis les données audit (somme de toutes les sections)
- Ajout d'années via un champ inline
- Graphes SVG : barres empilées (toutes énergies) + barres individuelles (électricité, gaz, process)

### Rapport (`/projects/:id/report`)
- Formulaire : type d'audit, thématique, prestataire, auditeur, compétences AMUREBA
- Génération d'un `.docx` à partir d'un template Word (variables `{{ }}`)
- Bouton "Sauvegarder + Télécharger" — sauvegarde automatique avant génération

### Dashboard
- Compteurs : total projets, en cours, en attente, terminés, nouveaux ce mois
- Liste des 5 projets les plus récents

### Agenda
- Création / suppression d'événements (titre, date, durée, lieu, projet lié, notes)
- Détection automatique du type : Visite · Call · Deadline · Autre
- Persisté en base de données (table `events`)

### Requêtes client
- Envoi et suivi des demandes de documents aux clients
- Liste des documents demandés avec statut reçu/en attente
- Feedback et fichiers reçus
- Persisté en base de données (table `client_requests`)

---

## API Backend

### Projets

| Méthode | Route | Description |
|---|---|---|
| GET | `/projects` | Liste tous les projets |
| POST | `/projects` | Crée un projet (génère l'Excel) |
| PATCH | `/projects/{id}` | Modifie les métadonnées |
| DELETE | `/projects/{id}` | Supprime le projet + fichier Excel |

### Audit & Énergie

| Méthode | Route | Description |
|---|---|---|
| GET | `/projects/{id}/audit` | Récupère les données audit |
| PATCH | `/projects/{id}/audit` | Sauvegarde audit + écrit dans Excel + recalcule |
| GET | `/projects/{id}/excel` | Télécharge le fichier Excel |
| GET | `/projects/{id}/indices` | Lit les indices calculés depuis l'Excel |
| GET | `/projects/{id}/energy-accounting` | Récupère la comptabilité énergétique |
| PATCH | `/projects/{id}/energy-accounting` | Sauvegarde la comptabilité |
| POST | `/projects/{id}/energy-accounting/import-from-audit` | Importe et somme depuis l'audit |

### Rapport

| Méthode | Route | Description |
|---|---|---|
| GET | `/projects/{id}/report` | Récupère les données rapport |
| PATCH | `/projects/{id}/report` | Sauvegarde les données rapport |
| GET | `/projects/{id}/report/docx` | Génère et télécharge le rapport Word |

### Agenda

| Méthode | Route | Description |
|---|---|---|
| GET | `/events` | Liste tous les événements |
| POST | `/events` | Crée un événement |
| DELETE | `/events/{id}` | Supprime un événement |

### Requêtes client

| Méthode | Route | Description |
|---|---|---|
| GET | `/client-requests` | Liste toutes les requêtes |
| POST | `/client-requests` | Crée une requête |
| PATCH | `/client-requests/{id}` | Met à jour statut / documents / feedback |
| DELETE | `/client-requests/{id}` | Supprime une requête |

---

## Prérequis

- **Python 3.11+** avec pip
- **Node.js 18+** avec npm
- **PostgreSQL 14+** — base de données `heatsight` créée et accessible
- **LibreOffice** (pour le recalcul des formules Excel)
  - macOS : `/Applications/LibreOffice.app/Contents/MacOS/soffice`
  - Le path est configuré dans `backend/app/main.py` — à adapter selon ton OS

---

## Lancer le projet en local

### 1. Configurer la base de données

Créer la base PostgreSQL si ce n'est pas encore fait :

```bash
createdb heatsight
```

Créer le fichier `.env` dans `backend/` :

```bash
cp backend/.env.example backend/.env
# puis éditer backend/.env avec ta DATABASE_URL :
# DATABASE_URL=postgresql://user:password@localhost:5432/heatsight
```

### 2. Backend (FastAPI)

```bash
# Depuis la racine du projet
conda activate heatsight   # ou ton environnement Python
pip install -r backend/requirements.txt

# Appliquer les migrations (crée les tables)
cd backend
alembic upgrade head
cd ..

# Lancer le serveur
uvicorn app.main:app --reload --app-dir backend
```

API disponible sur : `http://127.0.0.1:8000`
Documentation Swagger : `http://127.0.0.1:8000/docs`

### 3. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Application disponible sur : `http://localhost:5173`

---

## Limitations connues du MVP

- **Single-user** : pas d'authentification réelle, pas de gestion multi-utilisateurs (login mock)
- **Template Excel** : limité à 2 lignes par section (Activité op., Bâtiments, Transport, Utilité) — un avertissement s'affiche si dépassé
- **LibreOffice** : path hardcodé pour macOS — à adapter pour Windows/Linux
- **Année d'audit** : fixée à `2023` dans le template Excel
