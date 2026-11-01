# A11y Lens

Extension de navigateur (Manifest V3) pour auditer l'accessibilité d'une page web : elle analyse la page active, détecte les problèmes d'accessibilité courants (images sans `alt`, noms accessibles manquants, contraste, titres, landmarks…) et affiche un rapport clair dans une popup, exportable en JSON/CSV.

> 🚧 Projet en cours de construction — voir le plan de développement ci-dessous.

## Stack

- Manifest V3 (Chrome / Edge)
- TypeScript strict
- Vite (build multi-pages de la popup et des options)
- Vitest + happy-dom (tests unitaires)
- ESLint (flat config) + Prettier

## Choix d'architecture

- **Permissions minimales** : `activeTab` + `scripting` uniquement. Aucun content script permanent : le moteur d'audit est injecté à la demande sur le clic de la popup (`chrome.scripting.executeScript`).
- **Séparation stricte** : logique d'audit (`src/audit`) / génération du rapport (`src/core`) / UI (`src/popup`, `src/options`) / utilitaires (`src/utils`).
- **Contrat commun de règles** : chaque règle d'accessibilité implémente une interface unique → ajout de règle = un fichier dans `src/audit/rules/`.
- **Zéro dépendance externe** : aucune API distante, aucun backend.

## Structure du projet

```
a11y-lens/
├── scripts/                  # Outils Node (ESM)
│   ├── manifest.config.mjs   # Contrat du manifest V3 (source de vérité)
│   ├── generate-manifest.mjs # Génère dist/manifest.json
│   └── lib/fs-utils.mjs      # Helpers fs
├── src/
│   ├── audit/                # Moteur d'audit + règles (étapes 5-7)
│   │   └── rules/            # Une règle = un fichier
│   ├── core/                 # Score, modèle de rapport, exports (étape 8+)
│   ├── popup/                # UI popup (HTML/TS/CSS, étapes 9-10)
│   ├── options/              # Page d'options (étape 13)
│   ├── utils/                # Utilitaires transverses
│   ├── types/                # Types globaux
│   └── assets/icons/         # Icônes de l'extension
├── tests/                    # Tests Vitest (happy-dom)
├── tsconfig.base.json        # Options TS partagées (strict)
├── tsconfig.json             # Typage du code applicatif (src/)
├── tsconfig.test.json        # Typage des tests + scripts Node
├── vitest.config.ts          # Config Vitest
├── eslint.config.js          # ESLint flat config
└── .prettierrc.json          # Prettier
```

## Commandes

| Commande                             | Rôle                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| `npm run dev`                        | Dev server Vite (prévisualisation popup) — étape 9   |
| `npm run build`                      | `tsc --noEmit` + build Vite + génération du manifest |
| `npm test`                           | Tests unitaires (Vitest + happy-dom)                 |
| `npm run test:watch`                 | Tests en watch mode                                  |
| `npm run lint`                       | ESLint                                               |
| `npm run format`                     | Prettier --write                                     |
| `node scripts/generate-manifest.mjs` | Régénère `dist/manifest.json` seul                   |

## Plan de développement

- [x] Étape 1 : initialisation du projet
- [ ] Étape 2 : architecture et structure des dossiers
- [ ] Étape 3 : manifest.json et permissions minimales
- [ ] Étape 4 : types et contrat des règles d'audit
- [ ] Étape 5 : moteur d'audit
- [ ] Étape 6 : règles d'accessibilité de base
- [ ] Étape 7 : règle de contraste
- [ ] Étape 8 : score et modèle de rapport
- [ ] Étape 9 : UI popup principale
- [ ] Étape 10 : affichage des résultats
- [ ] Étape 11 : export JSON et CSV
- [ ] Étape 12 : gestion des erreurs et pages non analysables
- [ ] Étape 13 : options et préférences simples
- [ ] Étape 14 : tests unitaires
- [ ] Étape 15 : packaging et README
- [ ] Étape 16 : améliorations UX et finition

## Charger l'extension (à partir de l'étape 3)

1. `npm run build`
2. Ouvrir `chrome://extensions` (ou `edge://extensions`)
3. Activer le **Mode développeur**
4. **Charger une extension non empaquetée** → sélectionner le dossier `dist/`
