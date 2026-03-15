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
| Auth | JWT (`python-jose`), hachage mot de passe (`bcrypt`) |
| Frontend | React 18, React Router v7, Vite |
| Calcul Excel | LibreOffice headless (recalcul des formules, détecté via `shutil.which`) |
| Persistance | PostgreSQL + SQLAlchemy 2 (ORM) + Alembic (migrations) |
| Styling | Inline styles (pas de framework CSS) |
| Déploiement | Docker (`backend/Dockerfile`) — compatible Render |

---

## Structure du dépôt

```text
HeatSight/
├── backend/
│   ├── app/
│   │   ├── main.py                 # API FastAPI — toutes les routes (auth + métier)
│   │   ├── database.py             # Engine SQLAlchemy + get_db()
│   │   ├── models.py               # Modèles ORM (7 tables dont users)
│   │   ├── schemas.py              # Schémas Pydantic (validation / sérialisation)
│   │   ├── templates/
│   │   │   ├── audit_template.xlsx # Template Excel avec formules d'indices
│   │   │   └── report_template.docx# Template Word (variables docxtpl)
│   │   ├── excel/                  # Fichiers Excel générés par projet (UUID.xlsx)
│   │   └── reports/                # Rapports Word générés (UUID_report.docx)
│   ├── migrations/
│   │   ├── versions/
│   │   │   ├── 001_create_projects_table.py    # Table projects
│   │   │   ├── 002_add_module_tables.py        # Tables events, client_requests,
│   │   │   │                                   #   energy_accounting, audits, reports
│   │   │   └── 003_add_users_and_owner_id.py   # Table users + owner_id sur projects
│   │   ├── env.py
│   │   └── script.py.mako
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── Dockerfile                  # Image Docker (python:3.11-slim + LibreOffice)
│   ├── start.sh                    # Migrations Alembic + démarrage uvicorn
│   ├── .env                        # Non versionné — à créer (voir ci-dessous)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── layout/
│   │   │   └── AppLayout.jsx       # Layout principal (sidebar + topbar + contenu)
│   │   ├── pages/
│   │   │   ├── Login.jsx           # Page de connexion (JWT)
│   │   │   ├── Register.jsx        # Page d'inscription
│   │   │   ├── Dashboard.jsx       # Statistiques globales + projets récents
│   │   │   ├── Projects.jsx        # CRUD projets (table + modals)
│   │   │   ├── Agenda.jsx          # Gestion d'événements (persisté en base)
│   │   │   ├── ClientRequests.jsx  # Requêtes client (persisté en base)
│   │   │   ├── ShareAccess.jsx     # Partage & Accès
│   │   │   ├── ProjectAudit.jsx    # Saisie audit (4 onglets, mapping Excel)
│   │   │   ├── ProjectEnergy.jsx   # Comptabilité énergétique multi-annuelle + graphes
│   │   │   └── ProjectReport.jsx   # Génération rapport Word
│   │   ├── state/
│   │   │   ├── AuthContext.jsx     # Contexte auth (token JWT + user courant)
│   │   │   └── ProjectContext.jsx  # Context React — projet sélectionné (persisté localStorage)
│   │   ├── ui/
│   │   │   ├── Sidebar.jsx         # Navigation principale + navigation projet
│   │   │   ├── TopBar.jsx          # Barre supérieure (nom utilisateur + déconnexion)
│   │   │   ├── StatusPill.jsx      # Badge de statut
│   │   │   └── RequireAuth.jsx     # Guard de route (redirige si non connecté)
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
| `users` | Comptes utilisateurs (email, mot de passe haché, nom) |
| `projects` | Projets d'audit (métadonnées, statut, fichier Excel associé, `owner_id`) |
| `events` | Événements agenda (visites, appels, deadlines) |
| `client_requests` | Demandes de documents envoyées aux clients |
| `energy_accounting` | Comptabilité énergétique annuelle par projet |
| `audits` | Données audit par projet (énergies, facteurs d'influence, factures) |
| `reports` | Données rapport par projet (type, thème, auditeur, compétences) |

Les migrations sont gérées avec **Alembic**. Les scripts se trouvent dans `backend/migrations/versions/`.

---

## Fonctionnalités

### Authentification
- Inscription avec email, nom complet et mot de passe (haché avec bcrypt)
- Connexion par email/mot de passe → retourne un token JWT (validité 8h)
- Toutes les routes métier sont protégées (`Authorization: Bearer <token>`)
- Isolation complète des données : chaque utilisateur ne voit que ses propres projets
- Déconnexion via la TopBar (purge du localStorage)

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
- Écriture automatique dans l'Excel du projet à la sauvegarde (repart toujours du template propre)
- Recalcul via LibreOffice headless → lecture des indices calculés (IEE, IC, iSER, AEE, iCO₂, ACO₂)
- Si LibreOffice indisponible : les indices non recalculés s'affichent avec "—" et un message invite à télécharger l'Excel
- Téléchargement du fichier Excel (s'ouvre avec `fullCalcOnLoad` activé)

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

### Authentification

| Méthode | Route | Description |
|---|---|---|
| POST | `/auth/register` | Crée un compte (email, full_name, password) |
| POST | `/auth/login` | Connexion → retourne `access_token` (JWT) |

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
- **LibreOffice** (pour le recalcul des formules Excel — optionnel en local)
  - macOS : installez LibreOffice, le path `/Applications/LibreOffice.app/...` est détecté automatiquement
  - Linux : `apt install libreoffice` — la commande `libreoffice` est détectée via `shutil.which`
  - Sans LibreOffice, l'app fonctionne mais les indices affichent "—" (les formules ne sont pas recalculées)

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
# puis éditer backend/.env :
# DATABASE_URL=postgresql://user:password@localhost:5432/heatsight
# SECRET_KEY=une-clé-secrète-aléatoire-longue
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

## Déploiement (Render)

Le backend est conteneurisé via `backend/Dockerfile` :

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y libreoffice --no-install-recommends
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["bash", "start.sh"]
```

Sur Render, configurer le service Web avec :
- **Environment** : Docker
- **Root Directory** : `backend`
- **Variables d'environnement** : `DATABASE_URL`, `SECRET_KEY`

`start.sh` exécute automatiquement `alembic upgrade head` avant de démarrer uvicorn.

> Le filesystem Render est éphémère — les fichiers Excel sont régénérés depuis le template à chaque redémarrage via `_ensure_excel()`. Les données audit restent en base PostgreSQL.

---

## Robustesse Excel

Le template AMUREBA contient des **pivot caches** et des **références externes** qui peuvent corrompre la lecture openpyxl. Trois protections sont en place :

1. **Monkey-patch `WorkbookParser.pivot_caches`** — au démarrage du module, les erreurs de lecture des pivot caches sont silencieusement ignorées (retourne `{}`)
2. **`keep_links=False`** — passé à tous les appels `load_workbook` pour ignorer les liens externes
3. **`is_valid_excel()`** — vérifie l'intégrité ZIP avant tout accès ; `_ensure_excel` et `recalc_excel_in_place` suppriment et recréent le fichier si corrompu
4. **Template propre à chaque écriture** — `write_audit_to_excel` recopie systématiquement le template avant d'écrire les données

---

## Limitations connues du MVP

- **Template Excel** : limité à 2 lignes par section (Activité op., Bâtiments, Transport, Utilité) — un avertissement s'affiche si dépassé
- **Indices IEE / AEE** : nécessitent la colonne "surface" (M) du template Excel, non saisie dans l'app — s'affichent "—"
- **Année d'audit** : fixée à `2023` dans le template Excel
