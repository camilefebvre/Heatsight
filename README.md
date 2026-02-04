# HeatSight

**HeatSight** est un logiciel modulaire destiné aux **bureaux d’audit énergétique**, conçu pour assister les auditeurs à chaque étape de leur mission :  
de la **récolte de données** jusqu’à la **génération de rapports**, en passant par l’analyse énergétique, financière et environnementale.

Ce dépôt correspond à un **MVP technique** servant de base de développement et d’expérimentation (architecture, front, back, modules).

---

## Objectif du MVP

L’objectif de ce MVP est de :
- mettre en place une **architecture monorepo claire** (frontend + backend),
- développer une **interface utilisateur fonctionnelle** (dashboard, gestion documentaire),
- préparer une base **évolutive et modulaire**, inspirée d’outils comme Odoo,
- servir de support pour un **projet académique / entrepreneurial**.

---

## Architecture du projet

Monorepo contenant :
- **Backend** : API Python (FastAPI)
- **Frontend** : Application React (Vite)

---

## Structure du dépôt

```text
HeatSight/
├── backend/
│   ├── app/
│   │   └── main.py          # API FastAPI (Projects CRUD)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── layout/          # AppLayout, Sidebar
│   │   ├── pages/           # Dashboard, Projects, Documents
│   │   ├── ui/              # Composants UI réutilisables
│   │   ├── App.jsx          # Routing principal
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## Fonctionnalités actuellement disponibles

### Frontend (React)
- Layout global avec sidebar
- Page **Dashboard** (statistiques + audits récents)
- Page **Document Management** (UI + données mock)
- **Module Projects** (Création de projet via formulaire)
- Navigation avec React Router

### Backend (FastAPI)
- API FastAPI opérationnelle
- Gestion des projets d’audit (MVP, stockage en mémoire) :
- GET /projects → liste des projets
- POST /projects → création d’un projet
- PATCH /projects/{id} → modification partielle (edit / status)
- DELETE /projects/{id} → suppression
- Validation des données avec Pydantic
- CORS configuré pour communication frontend ↔ backend

---

## Lancer le projet en local

### Backend (FastAPI)

```bash
cd backend
conda activate heatsight   # ou ton environnement Python
pip install -r requirements.txt
uvicorn app.main:app --reload --app-dir backend
```
API disponible sur :  
`http://127.0.0.1:8000`

Test rapide :  
`http://127.0.0.1:8000/ping`


### Frontend (React)

```bash
cd frontend
npm install
npm run dev
```
Application disponible sur :  
`http://localhost:5173`

