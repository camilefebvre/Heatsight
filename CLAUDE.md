# Règles de travail — HeatSight

## 1. Plan avant toute modification

Avant de toucher à un fichier, présenter obligatoirement :

- La liste des fichiers concernés
- Les numéros de lignes exacts qui seront modifiées
- Le code exact qui sera ajouté ou remplacé (ancien → nouveau)
- L'impact attendu sur le comportement

## 2. Attendre une validation explicite

Ne jamais appliquer de modifications sans un accord explicite ("OK, applique" ou équivalent).
Proposer le plan, puis s'arrêter et attendre.

## 3. Lecture seule en première intention

Pour comprendre l'existant, toujours lire le code d'abord.
Ne pas supposer l'état du code à partir de sessions précédentes — lire les lignes concernées avant de proposer quoi que ce soit.

## 4. Diagnostic avant modification des fichiers critiques

Pour tout fichier de logique métier (backend, composants critiques comme `ProjectLCA.jsx`), produire d'abord un diagnostic en lecture seule avec les lignes exactes concernées avant de proposer une modification.
