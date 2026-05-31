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
│   │   │   ├── ProjectLCA2.jsx     # Module ACV — bâtiments, parois, composants, optimisation
│   │   │   ├── ProjectLCA.jsx      # Module ACV legacy (non accessible depuis la navigation)
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
│   │   └── utils/
│   │       └── lca2-helpers.js     # Helpers purs ACV (normStr, getLambda, isParoiExterieure…) — testés via Vitest
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
| `projects` | Projets d'audit (métadonnées, statut, fichier Excel, `excel_summary`, `prefill_summary`, `prefilled_excel`, `current_excel_source`, `report_docx`, `report_docx_source`, `report_prefill_summary`, `report_prefilled_at`) |
| `events` | Événements agenda (visites, appels, deadlines) |
| `client_requests` | Demandes de documents envoyées aux clients |
| `energy_accounting` | Comptabilité énergétique annuelle par projet — inclut `field_sources` (traçabilité IA) |
| `audits` | Données audit par projet (énergies, facteurs d'influence, factures) — inclut `field_sources` |
| `reports` | Données rapport par projet (type, thème, auditeur, compétences) — inclut `field_sources`, `extra_sections` (JSONB : page_de_garde, description_batiment, synthese_energetique, plan_amelioration) |
| `report_history` | Historique des pré-remplissages IA et uploads manuels du rapport Word (action_type, changes JSONB, fichier bytea) |
| `project_documents` | Fichiers uploadés par projet — stockés en `BYTEA`, avec `file_hash` SHA-256, statut IA et données extraites |
| `improvement_actions` | Actions du plan d'amélioration (référence AA1–AA9, investissement, économies, IRR, PBT…) |
| `plan_amelioration_history` | Historique des pré-remplissages IA et uploads manuels AMUREBA |
| `amelioration_actions` | Import AMUREBA flexible (JSONB) — une ligne par feuille AAx importée |
| `lca_materials` | Bibliothèque partagée de matériaux ACV — impacts EF v3.0 (JSONB 22 indicateurs), prix, `valeur_r`, `dvr_materiau`, `flux_reference` (isolants), `valeur_lambda` (isolants), `poids_unite` (non-isolants, kg/unité fonctionnelle — Module C déconstruction) |
| `lca_projects` | Données ACV par projet — bâtiments (parois, composants) en JSONB, `dvr_batiment`, `age_batiment`, cache d'optimisation |

### Migrations

Les tables sont gérées via **Alembic** (migrations versionnées). En local : `python -m alembic upgrade head` depuis `backend/`. En production (Render), les migrations doivent être appliquées manuellement depuis le Shell Render.

**Migrations appliquées (head : `161728cb1feb`) :**
- `005_add_lca_tables` — tables `lca_materials` et `lca_projects`
- `006_add_lca_material_fields` — champs de prix, valeur R et indicateurs EF v3.0
- `007_add_lca_building_fields` — champs bâtiments, parois et composants
- `008_add_flux_reference` — champ `flux_reference` sur `lca_materials`
- `009_add_lca_batiments` — colonne JSONB `batiments` sur `lca_projects`
- `010_add_lca_optimisation_cache` — champ `optimisation_cache` sur `lca_projects`
- `010_add_current_excel_source` — champ `current_excel_source` sur `projects` (`"template"` · `"ai_prefill"` · `"manual_upload"` · `"ai_patched"`)
- `011_add_lca_v2_fields` — `dvr_materiau` sur `lca_materials` ; `dvr_batiment` et `age_batiment` sur `lca_projects`
- `012_add_valeur_lambda` — `valeur_lambda` (Float) sur `lca_materials` + migration des valeurs stockées dans le JSONB `impacts`
- `013_add_poids_unite` — `poids_unite` (Float, nullable) sur `lca_materials` — masse par unité fonctionnelle (kg/unité) pour le calcul du Module C déconstruction (EN 15978) des matériaux non-isolants

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

Workflow de pré-remplissage IA du rapport Word, symétrique au module AMUREBA :

**1. Analyse IA → Checklist**
- Bouton "Analyser avec l'IA" → `POST prefill-preview` → Claude analyse l'ensemble des données du projet (audit, comptabilité énergétique, actions AMUREBA, documents) et propose des valeurs pour 4 sections du rapport
- Sections : Page de garde · Description du bâtiment · Situation énergétique · Plan d'amélioration
- Checklist interactive par champ : cocher/décocher chaque valeur proposée
- **Cartes dépliables par section** avec compteur de champs sélectionnés / total
- **Barre de filtres** : À traiter · Nouvelles · Remplacements · Estimations · Déjà appliquées · Toutes
  - "À traiter" actif par défaut (masque les items déjà appliqués)
  - "Déjà appliquées" affiche en lecture seule les propositions identiques à la valeur courante
- **Légende fixe** toujours visible : Champ vide · Remplace valeur existante · Estimation sans source · Déjà appliquée
- Champs `Remplace valeur existante` : pré-décochés + label "Proposé" + affichage de la valeur courante
- Champs `Déjà appliquée` : non-cochables (opacité réduite, curseur désactivé)
- Source affichée par valeur (document, base de données, estimation IA)
- Boutons "Tout cocher / décocher", "Tout ouvrir / replier"

**2. Appliquer les changements sélectionnés**
- `POST apply-prefill` : génère le `.docx` avec les champs sélectionnés appliqués dans le template Word
- Téléchargement immédiat du fichier Word
- Sauvegarde en base (`report_docx`, `report_prefill_summary`, `report_prefilled_at`, `report_docx_source = "ai_prefill"`)
- Entrée ajoutée dans l'historique (`AI_PREFILL`)

**3. Upload / import d'un rapport modifié**
- L'auditeur complète le `.docx` et le réimporte → `POST upload-docx`
- Le fichier uploadé devient la version courante (base des prochains pré-remplissages)
- Entrée ajoutée dans l'historique (`MANUAL_UPLOAD`)

**Fonctionnalités supplémentaires :**
- **Bandeau de statut** : indique si un rapport Word est disponible, sa source et sa date
- Bouton "Télécharger la version courante" → `GET report/docx`
- **Historique** (drawer latéral) : liste chronologique des pré-remplissages IA et uploads manuels avec détail par section et téléchargement des fichiers

### Plan d'amélioration AMUREBA (`/projects/:id/plan-amelioration`)

Workflow en 3 étapes :

**1. Analyse IA → Checklist**
- Bouton "Analyser les documents" → appel `POST prefill-preview` → Claude propose 1 à 9 actions chiffrées (AA1–AA9)
- Checklist interactive par champ : cocher/décocher chaque valeur proposée
- **Cartes dépliables par action** : chaque feuille AA est une carte repliable (première ouverte par défaut) ; bouton "Tout ouvrir / replier"
- **Détection de conflits** : chaque valeur proposée est catégorisée par comparaison avec l'Excel existant
  - `Champ vide` — cellule actuellement vide
  - `Remplace valeur existante` — pré-décoché (protection des saisies manuelles), affiche "Proposé" + valeur courante
  - `Estimation sans source` — valeur inférée sans document source
  - `Déjà appliquée` — valeur identique à l'Excel courant, non-cochable (lecture seule)
- **Barre de filtres** : À traiter (défaut) · Nouvelles · Remplacements · Estimations · Déjà appliquées · Toutes
- **Légende fixe** toujours visible dans le panel (remplace l'ancien bandeau conditionnel)
- Source affichée par valeur (`📄 document` si issue d'un fichier analysé, `🗄 base de données` si issue d'un champ DB, `🤖 Estimation IA` si inférée)
- Bouton "Tout cocher / décocher"

**2. Appliquer les changements sélectionnés**
- `POST apply-prefill` : génère l'Excel AMUREBA avec les valeurs sélectionnées
  - Si un Excel existe déjà en base (`prefilled_excel`) → patch **par-dessus** la version existante (manuel ou IA précédent) via `_apply_changes_to_source(bytes, …)`
  - Sinon → génère depuis le template vierge
- Données énergie automatiquement injectées dans la feuille `2023` depuis la comptabilité énergétique du projet
- Téléchargement immédiat du `.xlsx` pré-rempli
- Sauvegarde en base (`prefilled_excel`, `prefill_summary`, `prefilled_at`, `current_excel_source = "ai_patched"`)
- Entrée ajoutée dans l'historique (`AI_PREFILL`) avec la source de base (`base_source`)

**3. Compléter et uploader**
- L'auditeur complète les feuilles AA1–AA9 dans Excel
- Upload via "Uploader l'Excel complété" → `POST import-excel` → sauvegarde des actions en base + stockage des bytes (`current_excel_source = "manual_upload"`)
- Les futurs pré-remplissages IA partiront de ce fichier (pas du template vierge)
- Entrée ajoutée dans l'historique (`MANUAL_UPLOAD`)

**Fonctionnalités supplémentaires :**
- Onglets : AMUREBA (actif) · PEB · Autre · Mon propre template (bientôt)
- **Bandeau de statut** si un Excel pré-rempli existe déjà : date + bouton re-télécharger + bouton "Améliorer l'Excel existant"
- **Historique** (drawer latéral) : liste chronologique des pré-remplissages IA et uploads manuels, avec détail par feuille et source de base
- **Tableau des actions importées** : références AA1–AA9, investissement, économies, PBT, IRR, classification

**Génération Excel sans corruption** : le template AMUREBA contient des named ranges avec `#REF!` et des liens externes. openpyxl les corrompt à l'écriture. Solution : approche `zipfile` + `ElementTree` — seules les cellules cibles sont patchées, `workbook.xml` est copié byte-pour-byte. La stratégie de sérialisation XML ne ré-écrit que le bloc `<sheetData>` (splice dans les bytes originaux) pour éviter le mangling de préfixes de namespaces (`x14`/`xm` → `ns4`/`ns5`) qui corromprait le fichier. Le `calcChain.xml` est supprimé et `fullCalcOnLoad="1"` est injecté dans `<calcPr>` pour forcer Excel à recalculer les formules à l'ouverture.

### Analyse du cycle de vie — ACV (`/projects/:id/lca-v2`)

Moteur ACV complet basé sur la méthode **EF v3.0** et les conventions de **durée de vie de référence (DVR)**.

**Modélisation bâtiment :**
- Types de bâtiment : neuf · rénovation — détermine si le coût différentiel est calculé par rapport au statu quo
- DVR bâtiment (défaut 60 ans) + âge actuel — activent les calculs d'impacts amortis
- 5 moyens de chauffage avec facteurs CO₂ et prix kWh belges (gaz, mazout, bois, PAC, électrique)
- Modale de migration : projets créés sans DVR/âge proposent une saisie guidée pour activer le module ACV

**Parois et composants :**
- Parois typées : `mur` · `toiture` · `plancher` · `cloison` (les cloisons sont exclues des calculs extérieurs)
- Composants opaques (matériaux de la bibliothèque) : épaisseur (cm), λ (W/m·K), R (m²·K/W), coefficient d'efficacité (%)
- Baies vitrées : vitrage (valeur R) + cadre (valeur R), DVR par défaut 30 ans
- **Exclusion de paroi de l'optimisation** : bouton cadenas par carte de paroi — `paroi.is_fixed = true` exclut la paroi entière du moteur combinatoire, du hash de configuration et du détail des résultats ; badge **Exclue optim.** affiché sur la carte
- `U_effectif = U_théorique / (efficacité / 100)` — modélise la dégradation des matériaux existants
- Conventions λ/R unifiées post-refonte : colonne `valeur_lambda` prioritaire sur `impacts.valeur_lambda` (JSONB), puis fallback Convention 1 pour les isolants anciens

**Calculs ACV amortis (3 indicateurs) :**
- GWP100 amorti (kg CO₂eq), Énergie non renouvelable amortie (MJ), Santé humaine amortie (kg NMVOC eq — photochemical_oxidant_hh / EF v3.0)
- Nb cycles = `dvr_batiment / dvr_materiau` ; impact amorti = impact unitaire × quantité × nb cycles
- Affichage brut et amorti côte à côte par paroi et en synthèse bâtiment
- Composants sans DVR ou sans flux de référence (isolants) sont exclus du calcul avec compteur d'erreurs

**Module C — Déconstruction (EN 15978) :**
- Calcul de l'impact de fin de vie pour tous les composants ayant un `poids_unite` renseigné (non-isolants) ou un `flux_reference` (isolants)
- Masse calculée : `flux_reference × R_cible × surface` (isolants) ou `poids_unite × surface` (non-isolants)
- Facteurs système partagés : GWP100 = 7,209 kg CO₂eq/t · Énergie NR = 93,856 MJ/t · Santé = 0,0982 kg NMVOC/t
- Badge **⚠ DÉCON** affiché sur un composant si `poids_unite` manquant (non-isolant) ou `flux_reference` manquant (isolant)

**Optimisation multi-critères :** → voir section dédiée ci-dessous

### Bibliothèque ACV (`/lca/library`)
- Module de gestion des matériaux accessible depuis la sidebar (entrée **Bibliothèque ACV**)
- Import de matériaux via fichiers **LCIA-results.xlsx** (Activity Browser, méthode EF v3.0, 22 indicateurs dont `gwp100`, `energy_nonrenewable`, `photochemical_oxidant`)
  - Champ **DVR matériau** obligatoire à l'import (années)
  - Pour les isolants : **Flux de référence** (kg/m²·K/W) obligatoire + **λ** conductivité thermique (W/m·K) optionnel
- Colonnes **DVR (ans)** et **Flux réf.** visibles dans le tableau (Flux réf. affiché uniquement pour les isolants)
- Champ **Poids/unité** (kg/unité fonctionnelle) pour les matériaux non-isolants — requis pour le Module C déconstruction
- Badge **Incomplet ACV** sur les matériaux sans DVR, ou sans `flux_reference` (isolants) — indique qu'ils seront exclus des calculs amortis
- Badge **⚠ DÉCON** sur les composants d'un bâtiment sans `poids_unite` (non-isolants) ou sans `flux_reference` (isolants) — Module C non calculé
- Consultation des 22 indicateurs EF v3.0 par double-clic (fiche matériau)
- Modification de toutes les propriétés ACV par double-clic → édition en modale : nom, catégorie, prix, `valeur_r`, `dvr_materiau`, `flux_reference`, `valeur_lambda`, `poids_unite`
- Duplication et suppression de matériaux
- Gestion des alias de clés JSONB : `photochemical_oxidant_hh` (matériaux seedés) et `photochemical_oxidant` (matériaux importés) sont normalisés automatiquement

### Construction du bâtiment
- Modélisation par parois avec composants unifiés (opaques et baies vitrées)
- Champs épaisseur / λ / R liés et recalculés mutuellement selon la convention unifiée post-refonte
- Coefficient d'efficacité par composant (0–100 %) pour modéliser la dégradation des matériaux existants — `U_effectif = U_théorique / (efficacité / 100)`
- Calcul thermique basé sur degrés-jours (défaut 2 500 DJ Belgique)
- 5 moyens de chauffage avec facteurs CO₂ et rendements belges
- 3 widgets côte à côte : Construction + Impacts globaux + Indicateurs ACV (brut / amorti)
- Persistance via `PATCH` avec debounce 800 ms et hash de configuration

### Optimisation multi-critères
- Moteur 100 % frontend combinant **CSP** (filtres durs : budget, ROI max, GWP max, U moyen max, épaisseur isolant max) et **TOPSIS**
- **5 profils de solutions** : Statu quo · Maximum économique · Écologique · Meilleur ROI · TOPSIS
- Coûts différentiels (statu quo = 0 € de référence en mode neuf ; coût réel en mode rénovation)
- ROI calculé avec prix kWh selon moyen de chauffage : gaz = 0,12 · mazout = 0,11 · bois = 0,08 · PAC/électrique = 0,25 €/kWh
- Matériaux de remplacement toujours à efficacité 100 % (neufs)
- **Indicateurs affichés par profil :** coût différentiel, GWP100, énergie (kWh/an), CO₂ total (construction + exploitation), économies €/an, économies CO₂/an, ROI, Santé humaine amortie (kg NMVOC eq)
- **Algorithme TOPSIS** — 5 critères pondérés à égalité (1,0) : Δcoût (min), économies €/an (max), GWP100 amorti (min), énergie NR amortie (min), santé humaine amortie (min) ; normalisation euclidienne ; score `dA/(dI+dA)` ; bonus efficience ×1,15 pour les solutions au-dessus du P75 (calculé sur les efficiences finies strictement positives) ; solutions à Δcoût ≤ 0 → efficience = ∞ (bonus garanti) ; solutions sans gain GWP → exclues du bonus — sensibilité calculée sans bonus
- Les parois marquées `is_fixed` (cadenas activé) sont entièrement exclues du moteur combinatoire et du hash de configuration
- Profil **Écologique** : minimise GWP_amorti + CO₂_exploitation × DVR_bâtiment
- Profil **Meilleur ROI** : ratio économies/investissement sur 20 ans (exclu si Δcoût ≤ 0)
- Système de hash pour reproductibilité des résultats entre sessions et persistance du cache en base
- Création automatique de bâtiments « Optimisation 1/2/3 » depuis les solutions sélectionnées
- Détection **« Configuration déjà optimale »** : si tous les profils alternatifs sont dominés ou égaux au statu quo

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
| GET | `/projects/{id}/report` | Récupère les données rapport (métadonnées) |
| PATCH | `/projects/{id}/report` | Sauvegarde les données rapport |
| GET | `/projects/{id}/report/status` | Statut du rapport Word (`has_report_docx`, source, date, `report_fields`) |
| POST | `/projects/{id}/report/prefill-preview` | Claude propose les valeurs par section (JSON — pas de fichier) |
| POST | `/projects/{id}/report/apply-prefill` | Applique la sélection → génère `.docx` + entrée historique |
| POST | `/projects/{id}/report/upload-docx` | Importe un `.docx` modifié → version courante + historique |
| GET | `/projects/{id}/report/docx` | Télécharge le `.docx` sauvegardé (ou régénéré depuis le template) |
| GET | `/projects/{id}/report/history` | Historique des pré-remplissages et uploads |
| GET | `/projects/{id}/report/history/{entry_id}/file` | Télécharge un `.docx` historique |

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
| POST | `/lca/materials/import` | Importe un matériau depuis un LCIA-results.xlsx (multipart, `version=v2`) |
| PATCH | `/lca/materials/{id}` | Modifie un matériau (prix, valeur_r, dvr_materiau, flux_reference, valeur_lambda, poids_unite…) |
| DELETE | `/lca/materials/{id}` | Supprime un matériau |
| POST | `/lca/materials/{id}/duplicate` | Duplique un matériau |
| GET | `/projects/{id}/lca` | Récupère les données ACV du projet (bâtiments JSONB + dvr_batiment + age_batiment) |
| PATCH | `/projects/{id}/lca` | Sauvegarde les éléments ACV (legacy) |
| PATCH | `/projects/{id}/lca/batiments` | Sauvegarde les bâtiments avec parois, composants, DVR et âge bâtiment |
| PATCH | `/projects/{id}/lca/optimisation-cache?version=v2` | Sauvegarde le cache des résultats d'optimisation (hash + solutions + fixed_components) |
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

Solution : approche **`zipfile` + `ElementTree`** dans `_apply_changes_to_source()` :
- `workbook.xml` est copié **byte-pour-byte** depuis le template (aucun named range perdu)
- Seuls les XMLs des feuilles cibles (AA1–AA9 + `2023`) sont patchés via ElementTree
- **Stratégie de sérialisation XML** : seul le bloc `<sheetData>` est re-sérialisé puis spliced dans les bytes originaux — le reste du XML (namespaces `x14`/`xm`, extLst, mc:Ignorable) est préservé tel quel, évitant le mangling de préfixes (`x14` → `ns4`) qui corromprait le fichier
- Cellules numériques → `<v>N</v>` (formule supprimée pour éviter recalcul à 0)
- Cellules texte → `t="inlineStr"` + `<is><t>texte</t></is>` (pas de sharedStrings modifié)
- **`calcChain.xml` supprimé** du zip de sortie (la chaîne de calcul stale provoquerait des erreurs à l'ouverture) ; `fullCalcOnLoad="1"` injecté dans `<calcPr>` pour forcer le recalcul complet
- La fonction accepte une `Path` **ou des `bytes`** : permet de patcher par-dessus un Excel uploadé manuellement (`_apply_changes_to_source(bytes, …)`)

---

## Limitations connues

- **Template Excel audit** : limité à 2 lignes par section — un avertissement s'affiche si dépassé
- **Indices IEE / AEE** : nécessitent la colonne "surface" du template Excel — s'affichent "—" si non renseignée
- **Année d'audit** : fixée à `2023` dans le template Excel
- **Analyse IA** : `analyze-all` traite les documents en parallèle (max 3 simultanés) — un grand volume reste limité par le débit de l'API Anthropic
- **Plan d'amélioration PEB / Autre / Mon template** : onglets prévus, pas encore implémentés
- **ACV — calculs amortis** : nécessitent que chaque matériau ait une DVR renseignée, un `flux_reference` (isolants) ou un `poids_unite` (non-isolants) — les composants incomplets sont exclus du calcul avec badge ⚠ DÉCON
- **ACV — indicateur Santé humaine** : disponible uniquement si au moins un matériau de la bibliothèque contient la clé `photochemical_oxidant_hh` ou `photochemical_oxidant` dans ses impacts EF v3.0
- **ACV — module legacy** (`/projects/:id/lca`) : conservé en base de code mais retiré de la navigation
