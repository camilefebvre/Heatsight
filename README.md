# HeatSight

**HeatSight** est un logiciel modulaire destiné aux **bureaux d'audit énergétique**, conçu pour assister les auditeurs à chaque étape de leur mission : de la **saisie des données de consommation** jusqu'à la **génération de rapports Word**, en passant par l'analyse IA de documents, la comptabilité énergétique multi-annuelle, le **plan d'amélioration AMUREBA** pré-rempli par IA, et l'**analyse du cycle de vie (ACV/LCA)** des bâtiments.

Ce dépôt correspond à un **MVP technique** servant de base de développement et d'expérimentation.

---

## Objectif du MVP

- Mettre en place une **architecture monorepo claire** (frontend React + backend FastAPI)
- Couvrir le **workflow complet d'un audit** : création projet → saisie audit → documents IA → comptabilité énergétique → plan d'amélioration → rapport
- Intégrer un **template Excel AMUREBA** avec pré-remplissage IA et export sans corruption
- Générer des **rapports Word** à partir d'un template `.docx`
- Analyser automatiquement les factures et relevés via **Claude API** (Anthropic)
- Proposer des **actions d'amélioration chiffrées** via Claude à partir des documents analysés
- Calculer les **impacts environnementaux ACV** des parois et bâtiments (méthode EF v3.0)
- Persister toutes les données (y compris les fichiers) en **base de données PostgreSQL**
- Servir de support pour un projet académique / entrepreneurial

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Python 3.11+, FastAPI, Pydantic v2, openpyxl, docxtpl |
| Auth | JWT (`python-jose`), hachage mot de passe (`bcrypt`) |
| IA | Claude API (Anthropic SDK `anthropic>=0.40.0`) — modèle `claude-sonnet-4-20250514` |
| Frontend | React 18, React Router v7, Vite |
| Calcul Excel | LibreOffice headless (recalcul des formules, détecté via `shutil.which`) |
| Génération xlsx | `zipfile` + `xml.etree.ElementTree` (patch chirurgical des cellules — évite la corruption openpyxl) |
| Persistance | PostgreSQL + SQLAlchemy 2 (ORM) — migrations via `ALTER TABLE IF NOT EXISTS` au démarrage |
| Fichiers | Stockés en `BYTEA` dans PostgreSQL (pas de filesystem — compatible Render) |
| Styling | Inline styles (pas de framework CSS) |
| Déploiement | Docker (`backend/Dockerfile`) — compatible Render |

---

## Structure du dépôt

```text
HeatSight/
├── backend/
│   ├── app/
│   │   ├── main.py                 # API FastAPI — toutes les routes (auth + métier + IA)
│   │   ├── database.py             # Engine SQLAlchemy + get_db()
│   │   ├── models.py               # Modèles ORM (13 tables)
│   │   ├── schemas.py              # Schémas Pydantic (validation / sérialisation)
│   │   ├── amureba_mapping.py      # Service de mapping des feuilles AMUREBA
│   │   └── templates/
│   │       ├── audit_template.xlsx # Template Excel avec formules d'indices
│   │       ├── audit_template.xlsx # Template AMUREBA (feuilles AA0–AA9)
│   │       └── report_template.docx# Template Word (variables docxtpl)
│   ├── requirements.txt
│   ├── Dockerfile                  # Image Docker (python:3.11-slim + LibreOffice)
│   ├── start.sh                    # Démarrage uvicorn (tables créées au startup via ALTER TABLE)
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
│   │   │   ├── ProjectDocuments.jsx# Gestion documentaire + analyse IA par projet
│   │   │   ├── ProjectEnergy.jsx   # Comptabilité énergétique multi-annuelle + graphes
│   │   │   ├── ProjectReport.jsx   # Génération rapport Word
│   │   │   ├── ProjectPlanAmelioration.jsx  # Plan d'amélioration AMUREBA + IA
│   │   │   ├── ProjectLCA.jsx      # Analyse du cycle de vie (ACV) par projet
│   │   │   ├── LCAAdmin.jsx        # Administration de la bibliothèque ACV
│   │   │   └── LCALibrary.jsx      # Bibliothèque de matériaux ACV
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
| `projects` | Projets d'audit (métadonnées, statut, fichier Excel, `excel_summary`, `prefill_summary`, `prefilled_excel`) |
| `events` | Événements agenda (visites, appels, deadlines) |
| `client_requests` | Demandes de documents envoyées aux clients |
| `energy_accounting` | Comptabilité énergétique annuelle par projet — inclut `field_sources` (traçabilité IA) |
| `audits` | Données audit par projet (énergies, facteurs d'influence, factures) — inclut `field_sources` |
| `reports` | Données rapport par projet (type, thème, auditeur, compétences) — inclut `field_sources` |
| `project_documents` | Fichiers uploadés par projet — stockés en `BYTEA`, avec `file_hash` SHA-256, statut IA et données extraites |
| `improvement_actions` | Actions du plan d'amélioration (référence AA1–AA9, investissement, économies, IRR, PBT…) |
| `plan_amelioration_history` | Historique des pré-remplissages IA et uploads manuels AMUREBA |
| `amelioration_actions` | Import AMUREBA flexible (JSONB) — une ligne par feuille AAx importée |
| `lca_materials` | Bibliothèque partagée de matériaux ACV (impacts EF v3.0, prix, valeur R) |
| `lca_projects` | Données ACV par projet (bâtiments, parois, composants) |

### Migrations

Les tables sont créées/mises à jour au **démarrage du serveur** via des instructions `CREATE TABLE IF NOT EXISTS` et `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` dans `main.py`. Aucun outil de migration externe (pas d'Alembic en production).

**Migrations ACV appliquées :**
- `005_add_lca_tables` — tables `lca_materials` et `lca_projects`
- `006_add_lca_material_fields` — champs de prix, valeur R et indicateurs EF v3.0
- `007_add_lca_building_fields` — champs bâtiments, parois et composants
- `008_add_flux_reference` — champ `flux_reference` sur `lca_materials`
- `009_add_lca_optimisation_cache` — champ `optimisation_cache` sur `lca_projects`

---

## Fonctionnalités

### Authentification
- Inscription avec email, nom complet et mot de passe (haché avec bcrypt)
- Connexion par email/mot de passe → retourne un token JWT (validité 7 jours)
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
- Écriture automatique dans l'Excel du projet à la sauvegarde
- Recalcul via LibreOffice headless → lecture des indices calculés (IEE, IC, iSER, AEE, iCO₂, ACO₂)
- **Bandeau** : si des documents analysés existent, lien direct vers le module Documents
- **Highlighting** : champs remplis depuis un document → bordure gauche violette + tooltip

### Module Documents (`/projects/:id/documents`)
- Upload de fichiers PDF, JPEG ou PNG associés à un projet
- Types de documents : facture électricité / gaz / fuel, relevé compteur, contrat, autre
- Fichiers stockés en **bytea PostgreSQL** (pas de filesystem — robuste sur Render)
- **Hash SHA-256** calculé à l'upload et stocké (`file_hash`) — utilisé pour la déduplication
- **Visualisation** : double-clic sur un document → modale plein écran
- **Analyse IA individuelle** : bouton "🤖 Analyser" par document → appel Claude API
- **Analyse IA globale** : "Tout analyser" → traite tous les documents en attente / en erreur **en parallèle** (max 3 appels Claude simultanés via sémaphore)
- **Heuristique texte robuste** (`_has_useful_text`) : PDF natif exploitable si ≥ 200 chars, contient des chiffres (≥ 3 consécutifs), ≥ 90 % de caractères imprimables — sinon fallback vision automatique
- **Timeout pdfplumber** : extraction texte abandonnée après 10 s → fallback vision
- **Retry vision** : si l'extraction texte réussit mais que `consommation` ET `cout_total` sont null → relance automatique en mode vision (une seule fois)
- **Déduplication par hash** : si un document identique (même SHA-256) a déjà été analysé, ses données sont copiées sans appel API
- **Logging tokens** : chaque appel Claude imprime `[tokens] in=X out=Y doc_id=Z`
- Données extraites : énergie, consommation, unité, année, coût total, fournisseur, période, adresse, client, auditeur…
- Statuts IA : `pending` · `analyzed` · `error`
- **Logique non-overwrite** : ne remplace jamais un champ déjà rempli (≠ 0)
- Bouton **"✨ Appliquer partout"** : applique Audit + Comptabilité + Rapport en une action
- Boutons individuels **"→ Audit"**, **"→ Comptabilité"**, **"→ Rapport"**
- **Traçabilité `field_sources`** : chaque champ rempli enregistre `{ source, doc_name, doc_id }`

### Comptabilité énergétique (`/projects/:id/energy`)
- Suivi multi-annuel des consommations
- Import automatique depuis les données audit
- Graphes SVG : barres empilées + barres individuelles + donut de répartition des coûts
- **Highlighting** : champs remplis depuis un document (bordure violette + tooltip)

### Rapport (`/projects/:id/report`)
- Formulaire : type d'audit, thématique, prestataire, auditeur, compétences AMUREBA
- Génération d'un `.docx` à partir d'un template Word (variables `{{ }}`)
- **Highlighting** identique à la Comptabilité (traçabilité IA)

### Plan d'amélioration AMUREBA (`/projects/:id/plan-amelioration`)

Workflow en 3 étapes :

**1. Analyse IA → Checklist**
- Bouton "Analyser les documents" → appel `POST prefill-preview` → Claude propose 1 à 9 actions chiffrées (AA1–AA9)
- Checklist interactive par champ : cocher/décocher chaque valeur proposée
- Champs texte (intitulé, type, classification) affichés en lecture seule comme contexte
- Champs numériques (investissement, économies énergie/CO₂, durée amort.) : checkables → injectés dans l'Excel
- Source affichée par valeur (`📄 nom_du_fichier` si issue d'un doc, `🤖 IA` si estimée)
- Bouton "Tout cocher / décocher"

**2. Appliquer les changements sélectionnés**
- `POST apply-prefill` : génère le template AMUREBA avec uniquement les valeurs numériques sélectionnées
- Téléchargement immédiat du `.xlsx` pré-rempli
- Sauvegarde automatique en base (`prefilled_excel`, `prefill_summary`, `prefilled_at`)
- Entrée ajoutée dans l'historique (`AI_PREFILL`)

**3. Compléter et uploader**
- L'auditeur complète les feuilles AA1–AA9 dans Excel
- Upload via "Uploader l'Excel complété" → `POST import-excel` → sauvegarde des actions en base
- Entrée ajoutée dans l'historique (`MANUAL_UPLOAD`)

**Fonctionnalités supplémentaires :**
- Onglets : AMUREBA (actif) · PEB · Autre · Mon propre template (bientôt)
- **Bandeau de statut** si un Excel pré-rempli existe déjà : date + bouton re-télécharger + bouton "Améliorer l'Excel existant"
- **Résumé sauvegardé** : affiche les valeurs du dernier pré-remplissage par feuille
- **Historique** (drawer latéral) : liste chronologique des pré-remplissages IA et uploads manuels, avec détail par feuille
- **Tableau des actions importées** : références AA1–AA9, investissement, économies, PBT, IRR, classification

**Génération Excel sans corruption** : le template AMUREBA contient des named ranges avec `#REF!` et des liens externes. openpyxl les corrompt à l'écriture. Solution : approche `zipfile` + `ElementTree` — seules les cellules cibles sont patchées dans les XMLs des feuilles, `workbook.xml` est copié byte-pour-byte depuis le template.

### Analyse du cycle de vie — ACV (`/projects/:id/lca`)
- Saisie des bâtiments, parois et composants
- Calcul des impacts environnementaux selon la méthode **EF v3.0** (19 indicateurs : GWP100, énergie non renouvelable, particulate matter, land use, écotoxicité…)
- Bibliothèque de matériaux partagée entre tous les projets

### Bibliothèque ACV (`/lca/library`)
- Module de gestion des matériaux accessible depuis la sidebar
- Import de matériaux via fichiers **LCIA-results.xlsx** (Activity Browser, méthode EF v3.0, 19 indicateurs)
- Consultation des 19 indicateurs par double-clic
- Modification du prix / valeur R / flux_reference par matériau
- Duplication et suppression de matériaux

### Construction du bâtiment
- Modélisation par parois avec composants unifiés (opaques et baies vitrées)
- Champs épaisseur / λ / R liés et recalculés mutuellement
- Coefficient d'efficacité par composant (0–100 %) pour modéliser la dégradation des matériaux existants — `U_effectif = U_théorique / (efficacité / 100)`
- Calcul thermique basé sur degrés-jours (défaut 2 500 DJ Belgique)
- 5 moyens de chauffage avec facteurs CO₂ et rendements belges
- 2 widgets côte à côte : Construction + Impacts globaux
- Persistance via `PATCH` avec debounce 800 ms et hash de configuration

### Optimisation multi-critères
- Moteur 100 % frontend combinant **CSP** (filtres durs : budget, ROI, GWP100 max, U max PEB) et **TOPSIS**
- 5 profils de solutions : statu quo · économique · écologique · meilleur ROI · TOPSIS
- Coûts différentiels (statu quo = 0 € de référence)
- ROI calculé avec prix kWh selon moyen de chauffage : gaz = 0,12 · mazout = 0,11 · bois = 0,08 · PAC/électrique = 0,25 €/kWh
- Matériaux de remplacement toujours à efficacité 100 % (neufs)
- 3 indicateurs principaux (GWP100, énergie non renouvelable, particulate matter) + 2 complémentaires (land use, écotoxicité)
- Système de hash pour reproductibilité des résultats entre sessions
- Création automatique de bâtiments « Optimisation 1/2/3 » depuis les solutions sélectionnées

### Administration ACV (`/lca/admin`)
- Import de matériaux depuis un fichier **LCIA-results.xlsx** (format EF v3.0)
- Modification des propriétés : nom, catégorie, prix, valeur R, unité fonctionnelle
- Duplication et suppression de matériaux

### Dashboard
- Compteurs : total projets, en cours, en attente, terminés, nouveaux ce mois
- Liste des 5 projets les plus récents

### Agenda
- Création / suppression d'événements (titre, date, durée, lieu, projet lié, notes)
- Détection automatique du type : Visite · Call · Deadline · Autre

### Requêtes client
- Envoi et suivi des demandes de documents aux clients
- Feedback et fichiers reçus

---

## API Backend

### Authentification

| Méthode | Route | Description |
|---|---|---|
| POST | `/auth/register` | Crée un compte |
| POST | `/auth/login` | Connexion → retourne `access_token` (JWT) |

### Projets

| Méthode | Route | Description |
|---|---|---|
| GET | `/projects` | Liste tous les projets |
| POST | `/projects` | Crée un projet |
| PATCH | `/projects/{id}` | Modifie les métadonnées |
| DELETE | `/projects/{id}` | Supprime le projet |

### Audit & Énergie

| Méthode | Route | Description |
|---|---|---|
| GET | `/projects/{id}/audit` | Récupère les données audit |
| PATCH | `/projects/{id}/audit` | Sauvegarde audit + écrit dans Excel + recalcule |
| GET | `/projects/{id}/excel` | Télécharge le fichier Excel |
| GET | `/projects/{id}/indices` | Lit les indices calculés |
| GET | `/projects/{id}/energy-accounting` | Récupère la comptabilité énergétique |
| PATCH | `/projects/{id}/energy-accounting` | Sauvegarde la comptabilité |
| POST | `/projects/{id}/energy-accounting/import-from-audit` | Importe depuis l'audit |

### Documents

| Méthode | Route | Description |
|---|---|---|
| POST | `/projects/{id}/documents` | Upload un fichier (multipart, stocké en bytea) |
| GET | `/projects/{id}/documents` | Liste les documents |
| DELETE | `/projects/{id}/documents/{doc_id}` | Supprime un document |
| GET | `/projects/{id}/documents/{doc_id}/file` | Télécharge le fichier brut |
| POST | `/projects/{id}/documents/{doc_id}/analyze` | Analyse avec Claude API |
| POST | `/projects/{id}/documents/analyze-all` | Analyse tous les documents pending/error |

### Rapport

| Méthode | Route | Description |
|---|---|---|
| GET | `/projects/{id}/report` | Récupère les données rapport |
| PATCH | `/projects/{id}/report` | Sauvegarde les données rapport |
| GET | `/projects/{id}/report/docx` | Génère et télécharge le rapport Word |

### Plan d'amélioration AMUREBA

| Méthode | Route | Description |
|---|---|---|
| GET | `/projects/{id}/improvement-actions` | Liste les actions importées |
| POST | `/projects/{id}/improvement-actions` | Crée une action manuellement |
| PUT | `/projects/{id}/improvement-actions/{action_id}` | Met à jour une action |
| DELETE | `/projects/{id}/improvement-actions/{action_id}` | Supprime une action |
| POST | `/projects/{id}/improvement-actions/prefill-preview` | Claude propose des actions (JSON — pas de fichier) |
| POST | `/projects/{id}/improvement-actions/apply-prefill` | Applique la sélection → génère xlsx + historique |
| POST | `/projects/{id}/improvement-actions/prefill-excel` | Génère xlsx pré-rempli (flux complet) |
| GET | `/projects/{id}/improvement-actions/prefill-status` | Statut du dernier pré-remplissage |
| GET | `/projects/{id}/improvement-actions/export-excel` | Télécharge le xlsx sauvegardé (ou template vierge) |
| POST | `/projects/{id}/improvement-actions/import-excel` | Importe un AMUREBA complété → sauvegarde en base |
| GET | `/projects/{id}/improvement-actions/history` | Historique des pré-remplissages et uploads |
| GET | `/projects/{id}/plan-amelioration` | Liste les actions importées (JSONB flexible) |
| POST | `/projects/{id}/plan-amelioration/preview` | Prévisualise un import AMUREBA sans sauvegarder |
| POST | `/projects/{id}/plan-amelioration/import` | Importe et sauvegarde un AMUREBA (format JSONB) |
| DELETE | `/projects/{id}/plan-amelioration/{action_id}` | Supprime une action importée |

### ACV / LCA

| Méthode | Route | Description |
|---|---|---|
| GET | `/lca/materials` | Liste tous les matériaux de la bibliothèque |
| GET | `/lca/materials/{id}` | Détail d'un matériau |
| POST | `/lca/materials/import` | Importe un matériau depuis un LCIA-results.xlsx |
| PATCH | `/lca/materials/{id}` | Modifie un matériau |
| DELETE | `/lca/materials/{id}` | Supprime un matériau |
| POST | `/lca/materials/{id}/duplicate` | Duplique un matériau |
| GET | `/projects/{id}/lca` | Récupère les données ACV du projet |
| PATCH | `/projects/{id}/lca` | Sauvegarde les éléments ACV (legacy) |
| PATCH | `/projects/{id}/lca/batiments` | Sauvegarde les bâtiments avec parois et composants |
| PATCH | `/projects/{id}/lca/optimisation-cache` | Sauvegarde le cache des résultats d'optimisation |
| GET | `/projects/{id}/audit/energie-chauffage` | Récupère le moyen de chauffage pour le calcul ROI |

### Agenda

| Méthode | Route | Description |
|---|---|---|
| GET | `/events` | Liste tous les événements |
| POST | `/events` | Crée un événement |
| PATCH | `/events/{id}` | Met à jour un événement |
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
- **Clé API Anthropic** — pour l'analyse IA des documents ([console.anthropic.com](https://console.anthropic.com))
- **LibreOffice** (pour le recalcul des formules Excel — optionnel en local)
  - macOS : installez LibreOffice, le path `/Applications/LibreOffice.app/...` est détecté automatiquement
  - Linux : `apt install libreoffice` — la commande `libreoffice` est détectée via `shutil.which`

---

## Lancer le projet en local

### 1. Configurer la base de données

```bash
createdb heatsight
```

Créer le fichier `.env` dans `backend/` :

```bash
cp backend/.env.example backend/.env
# puis éditer backend/.env :
# DATABASE_URL=postgresql://user:password@localhost:5432/heatsight
# SECRET_KEY=une-clé-secrète-aléatoire-longue
# ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 2. Backend (FastAPI)

```bash
conda activate heatsight   # ou ton environnement Python
pip install -r backend/requirements.txt

# Lancer le serveur (les tables sont créées automatiquement au démarrage)
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
- **Variables d'environnement** : `DATABASE_URL`, `SECRET_KEY`, `ANTHROPIC_API_KEY`

`start.sh` démarre uvicorn directement — les tables sont créées/mises à jour au démarrage via `ALTER TABLE IF NOT EXISTS` (pas d'Alembic).

> Le filesystem Render est éphémère — les fichiers Excel sont régénérés depuis le template. Les documents uploadés et les xlsx pré-remplis sont stockés en **bytea PostgreSQL**.

---

## Robustesse Excel

### Template d'audit
- **Monkey-patch `WorkbookParser.pivot_caches`** — erreurs des pivot caches silencieusement ignorées
- **`keep_links=False`** — passé à tous les appels `load_workbook`
- **`is_valid_excel()`** — vérifie l'intégrité ZIP avant tout accès
- **Template propre à chaque écriture** — `write_audit_to_excel` recopie le template avant d'écrire

### Template AMUREBA (Plan d'amélioration)
Le template contient des **named ranges avec `#REF!`** et des **références externes** — openpyxl les corrompt à l'écriture ("Removed Records: Named range").

Solution : approche **`zipfile` + `ElementTree`** dans `_apply_changes_to_template()` :
- `workbook.xml` est copié **byte-pour-byte** depuis le template (aucun named range perdu)
- Seuls les XMLs des feuilles cibles (AA1–AA9) sont patchés via ElementTree
- Cellules numériques → `<v>N</v>` (formule supprimée pour éviter recalcul à 0)
- Cellules texte → `t="inlineStr"` + `<is><t>texte</t></is>` (pas de sharedStrings modifié)
- Tous les namespaces OOXML sont enregistrés avec `ET.register_namespace()` pour éviter le mangling `ns0:`

---

## Limitations connues

- **Template Excel audit** : limité à 2 lignes par section — un avertissement s'affiche si dépassé
- **Indices IEE / AEE** : nécessitent la colonne "surface" du template Excel — s'affichent "—" si non renseignée
- **Année d'audit** : fixée à `2023` dans le template Excel
- **Analyse IA** : `analyze-all` traite les documents en parallèle (max 3 simultanés) — un grand volume reste limité par le débit de l'API Anthropic
- **Plan d'amélioration PEB / Autre / Mon template** : onglets prévus, pas encore implémentés
- **LCA** : calcul des impacts basé sur la bibliothèque de matériaux — nécessite que les matériaux soient importés via l'admin ACV
