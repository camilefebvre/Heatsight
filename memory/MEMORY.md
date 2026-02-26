# HeatSight - Mémoire projet

## Contexte
MVP logiciel d'audit énergétique pour bureaux d'audit. Projet académique/entrepreneurial.
Monorepo: FastAPI backend + React frontend (Vite).

## Stack technique
- **Backend:** Python FastAPI, uvicorn, openpyxl, docxtpl, pydantic[email], LibreOffice (recalc Excel)
- **Frontend:** React 18, React Router v6, Vite, inline styles (pas de CSS framework), SVG charts custom
- **Stockage:** data.json local (MVP single-user)
- **Templates:** audit_template.xlsx + report_template.docx

## Lancer le projet
- Backend: `uvicorn app.main:app --reload --app-dir backend` (depuis racine)
- Frontend: `cd frontend && npm run dev`
- URLs: API http://127.0.0.1:8000, App http://localhost:5173

## Architecture frontend
- `src/state/ProjectContext.jsx` → selectedProjectId (quel projet est ouvert)
- `src/layout/AppLayout.jsx` → sidebar + outlet
- `src/ui/Sidebar.jsx` → nav principale + nav projet (conditionnel)
- Pages: Dashboard, Projects, Agenda, ProjectAudit, ProjectEnergy, ProjectReport

## Architecture backend (main.py - 625 lignes)
- CRUD projets (GET/POST/PATCH/DELETE /projects)
- Audit: PATCH /projects/:id/audit (écrit dans Excel) + GET /projects/:id/indices (lit Excel via LibreOffice)
- Energy accounting: CRUD + import depuis audit
- Rapport: CRUD + génération .docx (docxtpl)

## Données audit (structure Excel-mappée)
```
audit_data.year2023: {
  utility_headers, operational[], buildings[], transport[], utility[],
  influence_factors[], invoice_meter
}
```

## Limitations MVP actuelles
- Agenda non persisté (in-memory)
- Pas d'authentification
- Single-user (data.json)
- requirements.txt incomplet (manque openpyxl, docxtpl, pydantic[email], python-docx)

## Préférences utilisateur
- Langue: français (commentaires, discussions)
- Projet académique mais aussi entrepreneurial

## Fichiers clés
- `backend/app/main.py` — toute la logique API (625 lignes)
- `frontend/src/pages/ProjectAudit.jsx` — entrée données audit (612 lignes)
- `frontend/src/pages/ProjectEnergy.jsx` — comptabilité énergétique (573 lignes)
- `frontend/src/pages/Projects.jsx` — gestion projets CRUD (577 lignes)
- `backend/app/templates/audit_template.xlsx` — template Excel avec formules indices
- `backend/app/templates/report_template.docx` — template rapport Word
