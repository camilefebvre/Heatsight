# HeatSight

**HeatSight** est un logiciel modulaire destiné aux **bureaux d'audit énergétique**, conçu pour assister les auditeurs à chaque étape de leur mission : de la **saisie des données de consommation** jusqu'à la **génération de rapports Word**, en passant par l'analyse énergétique multi-annuelle et le calcul d'indices (IEE, IC, iSER…).

Ce dépôt correspond à un **MVP technique** servant de base de développement et d'expérimentation.

---

## Objectif du MVP

- Mettre en place une **architecture monorepo claire** (frontend React + backend FastAPI)
- Couvrir le **workflow complet d'un audit** : création projet → saisie audit → comptabilité énergétique → rapport
- Intégrer un **template Excel** avec calcul automatique d'indices via LibreOffice
- Générer des **rapports Word** à partir d'un template `.docx`
- Servir de support pour un projet académique / entrepreneurial

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Python 3.11+, FastAPI, Pydantic v2, openpyxl, docxtpl |
| Frontend | React 18, React Router v6, Vite |
| Calcul Excel | LibreOffice headless (recalcul des formules) |
| Persistance | JSON local (`data.json`) — MVP single-user |
| Styling | Inline styles (pas de framework CSS) |

---

## Structure du dépôt

```text
HeatSight/
├── backend/
│   ├── app/
│   │   ├── main.py                 # API FastAPI (625 lignes) — toute la logique
│   │   ├── data.json               # Stockage local des projets (non versionné)
│   │   ├── data.example.json       # Seed de départ
│   │   ├── templates/
│   │   │   ├── audit_template.xlsx # Template Excel avec formules d'indices
│   │   │   └── report_template.docx# Template Word (variables docxtpl)
│   │   ├── excel/                  # Fichiers Excel générés par projet (UUID.xlsx)
│   │   └── reports/                # Rapports Word générés (UUID_report.docx)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── layout/
│   │   │   └── AppLayout.jsx       # Layout principal (sidebar + contenu)
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # Statistiques globales + projets récents
│   │   │   ├── Projects.jsx        # CRUD projets (table + modals)
│   │   │   ├── Agenda.jsx          # Gestion d'événements (MVP)
│   │   │   ├── ProjectAudit.jsx    # Saisie audit (4 onglets, mapping Excel)
│   │   │   ├── ProjectEnergy.jsx   # Comptabilité énergétique multi-annuelle + graphes
│   │   │   └── ProjectReport.jsx   # Génération rapport Word
│   │   ├── state/
│   │   │   └── ProjectContext.jsx  # Context React — projet sélectionné (persisté localStorage)
│   │   ├── ui/
│   │   │   ├── Sidebar.jsx         # Navigation principale + navigation projet
│   │   │   └── StatusPill.jsx      # Badge de statut
│   │   ├── App.jsx                 # Routing principal
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
└── README.md
```

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
- Création d'événements (titre, date, durée, lieu, notes)
- MVP : stockage en mémoire (non persisté)

---

## API Backend

| Méthode | Route | Description |
|---|---|---|
| GET | `/projects` | Liste tous les projets |
| POST | `/projects` | Crée un projet (génère l'Excel) |
| PATCH | `/projects/{id}` | Modifie les métadonnées |
| DELETE | `/projects/{id}` | Supprime le projet + fichier Excel |
| GET | `/projects/{id}/audit` | Récupère les données audit |
| PATCH | `/projects/{id}/audit` | Sauvegarde audit + écrit dans Excel + recalcule |
| GET | `/projects/{id}/excel` | Télécharge le fichier Excel |
| GET | `/projects/{id}/indices` | Lit les indices calculés depuis l'Excel |
| GET | `/projects/{id}/energy-accounting` | Récupère la comptabilité énergétique |
| PATCH | `/projects/{id}/energy-accounting` | Sauvegarde la comptabilité |
| POST | `/projects/{id}/energy-accounting/import-from-audit` | Importe et somme depuis l'audit |
| GET | `/projects/{id}/report` | Récupère les données rapport |
| PATCH | `/projects/{id}/report` | Sauvegarde les données rapport |
| GET | `/projects/{id}/report/docx` | Génère et télécharge le rapport Word |

---

## Prérequis

- **Python 3.11+** avec pip
- **Node.js 18+** avec npm
- **LibreOffice** (pour le recalcul des formules Excel)
  - macOS : `/Applications/LibreOffice.app/Contents/MacOS/soffice`
  - Le path est configuré dans `backend/app/main.py` ligne 20 — à adapter selon ton OS

---

## Lancer le projet en local

### 1. Initialiser les données locales

```bash
cp backend/app/data.example.json backend/app/data.json
```

### 2. Backend (FastAPI)

```bash
# Depuis la racine du projet
conda activate heatsight   # ou ton environnement Python
pip install -r backend/requirements.txt
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

## Données locales (MVP)

Les projets sont stockés dans `backend/app/data.json` (non versionné, hors Git).

- `data.json` n'est pas committé (évite les conflits en équipe)
- Les fichiers Excel générés (`backend/app/excel/`) et les rapports Word (`backend/app/reports/`) ne sont pas non plus versionnés

---

## Limitations connues du MVP

- **Single-user** : pas d'authentification, pas de gestion multi-utilisateurs
- **Template Excel** : limité à 2 lignes par section (Activité op., Bâtiments, Transport, Utilité) — un avertissement s'affiche si dépassé
- **Agenda** : non persisté (in-memory)
- **LibreOffice** : path hardcodé pour macOS — à adapter pour Windows/Linux
- **Année d'audit** : fixée à `2023` dans le template Excel
