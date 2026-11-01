# 🔍 A11y Lens

**Extension de navigateur (Manifest V3) d'audit d'accessibilité** — analyse la page active, détecte les problèmes d'accessibilité les plus courants (images sans `alt`, noms accessibles manquants, contraste, titres, landmarks…) et affiche un rapport clair, exportable, directement dans une popup sobre et accessible.

> Projet portfolio 100 % local : aucune API externe, aucun backend, aucune télémétrie.

---

## ✨ Fonctionnalités

- **Audit à la demande** de l'onglet actif (injection ponctuelle via `chrome.scripting`, jamais de content script permanent).
- **13 règles d'accessibilité** couvrant le MVP WCAG :

| #   | Règle (`id`)            | Ce qu'elle détecte                                                     | Sévérité         |
| --- | ----------------------- | ---------------------------------------------------------------------- | ---------------- |
| 1   | `image-alt`             | Images sans texte alternatif (et décoratives sans `alt=""`)            | critique         |
| 2   | `button-name`           | Boutons sans nom accessible                                            | critique         |
| 3   | `link-name`             | Liens sans nom accessible                                              | critique         |
| 4   | `label`                 | Champs de formulaire sans `<label>` associé                            | critique         |
| 5   | `form-field-name`       | Champs sans `aria-label`/`aria-labelledby` quand le label est absent   | majeure          |
| 6   | `heading-order`         | Ordre des titres incohérents (sauts de niveau, h1 multiples/absents)   | modérée          |
| 7   | `html-lang`             | Absence ou invalidité de `lang` sur `<html>`                           | majeure          |
| 8   | `page-title`            | Absence de `<title>`                                                   | majeure          |
| 9   | `tabindex-positive`     | `tabindex` positif (ordre de tabulation forcé)                         | modérée          |
| 10  | `aria-hidden-focusable` | Éléments focusables masqués par `aria-hidden="true"`                   | critique         |
| 11  | `duplicate-id`          | Identifiants `id` dupliqués                                            | majeure          |
| 12  | `landmarks`             | Landmarks principaux manquants (`main`, `nav`, `header`, `footer`)     | modérée          |
| 13  | `color-contrast`        | Contraste texte/fond insuffisant (AA ou AAA), avec indice de confiance | dérivée du ratio |

- **Score global 0–100** pondéré par sévérité (voir « Scoring »).
- **Rapport structuré** : pour chaque problème — titre, description, sévérité, extrait HTML + chemin DOM, recommandation, critères WCAG.
- **UI riche** : résumé par sévérité cliquable, recherche plein-texte, tri, regroupement par sévérité ou par règle, accordéons, copie des détails, liens vers la documentation WCAG.
- **Exports** : JSON (fidèle au rapport), CSV RFC 4180 (une ligne par occurrence, BOM UTF-8, anti-injection de formules Excel), Markdown copiable dans le presse-papiers.
- **Préférences persistées** (page d'options) : activer/désactiver chaque règle, sensibilité du contraste AA/AAA, mode développeur.
- **Robustesse** : gestion explicite des pages non analysables (`chrome://`, Web Store, PDF, pages protégées), erreurs d'injection typées, timeout, page vide ; l'UI ne casse jamais et conserve le dernier rapport valide.
- **Accessible elle-même** : navigation clavier complète, live regions ARIA, contrastes ≥ 4.5:1, rendu sans `innerHTML` (le HTML de la page auditée n'est jamais injecté comme markup).

## 🧱 Stack technique

- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/) (Chrome / Edge, `minimum_chrome_version: 116`)
- TypeScript 5.6 en mode strict (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Vite 5 (build multi-pages popup/options) + plugin Vite maison pour les icônes
- Vitest 2 + happy-dom (~200 tests unitaires, couverture ~86 %)
- ESLint 9 (flat config) + Prettier
- Vanilla TS pour l'UI — aucun framework

## 🚀 Installation & build

```bash
git clone <repo-url> && cd a11y-lens
npm install

npm run dev        # prévisualisation de la popup dans un navigateur classique
npm run build      # typecheck strict → manifest généré → build Vite → dist/
npm run package    # build + vérification d'intégrité + archive release/*.zip
npm test           # suite Vitest complète
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (src + tests)
```

### Charger l'extension dans Chrome / Edge

1. `npm run build`
2. Ouvrir `chrome://extensions` (ou `edge://extensions`)
3. Activer le **Mode développeur** (coin supérieur droit)
4. Cliquer **« Charger une extension non empaquetée »** et sélectionner le dossier **`dist/`**
5. Épinglez l'icône A11y Lens dans la barre d'outils

### Tester en local

- Visitez n'importe quelle page publique (ex. une page avec des images sans `alt`), cliquez sur l'icône puis **« Analyser la page »**.
- Le dépôt contient des fixtures HTML de test (`tests/rules-basic.test.ts`) ; pour un banc d'essai manuel, servez une page HTML locale simple via `npx vite preview` ou ouvrez un fichier `file:///` (les pages `file://` nécessitent d'autoriser l'accès aux URL de fichier dans `chrome://extensions`).
- Testez les cas d'erreur en ouvrant `chrome://newtab` ou le Chrome Web Store : un message explicite explique pourquoi l'audit est impossible.
- Modifiez une règle et relancez `npm run test:watch` — les fixtures jsdom valident le comportement sans navigateur.

## 🏗️ Architecture

```
src/
├── types/          # Contrat partagé : Severity, AuditIssue, ElementFinding, AuditContext…
├── rules/rule.ts   # Interface unique AuditRule + defineRule() + normalizeIssue()
├── audit/          # Moteur indépendant de l'UI
│   ├── registry.ts         # Liste des règles (ajouter = 1 import + 1 entrée)
│   ├── audit-engine.ts     # Orchestration : contexte, options, tri, traces
│   ├── rule-runner.ts      # Exécution isolée (try/catch par règle, sanitisation)
│   ├── scoring.ts          # Score 0–100 pondéré + plafonds par sévérité
│   └── report-builder.ts   # A11yReport sérialisable (JSON-ready)
│   └── rules/              # 13 fichiers — 1 règle = 1 module pur
├── services/       # Pont UI ↔ moteur : executor (chrome.scripting), storage,
│                   # preferences, export-json/csv/markdown
├── utils/          # Fonctions pures : color (WCAG), dom, download, ui
├── popup/          # UI popup vanilla TS (machine à états idle/loading/done/error)
└── options/        # Page d'options accessible
scripts/            # Génération du manifest (source de vérité typée), icônes, packaging
tests/              # 12 fichiers de tests (moteur, règles, score, exports, UI, manifest)
```

**Flux de données** : clic popup → `services/executor` (pré-flight URL, injection `executeScript({ func: runAudit })`) → moteur + règles dans le contexte de la page → retour plain-data (`structuredClone`-compatible) → `report-builder` → rendu UI + persistance `chrome.storage` → exports.

### Ajouter une nouvelle règle (extensibilité)

```ts
// src/audit/rules/ma-regle.ts
import { defineRule } from '../rules/rule';

export const maRegle = defineRule({
  id: 'ma-regle',
  title: '…',
  description: '…',
  severity: 'major',
  category: 'structure',
  evaluate(ctx) {
    const els = ctx.document.querySelectorAll('[data-x]');
    return els.length ? { passed: false, issues: [/* RawIssue[] */] } : { passed: true };
  },
});
```

Puis l'enregistrer dans `src/audit/registry.ts`. Ni le moteur, ni l'UI, ni les exports ne sont à modifier : métadonnées, filtres, score et exports se branchent automatiquement sur le contrat commun.

## 🎯 Scoring (simple et défendable)

Chaque occurrence (élément fautif) porte une pénalité selon sa sévérité : **critique ×4, majeure ×2, modérée ×1, mineure ×0.5**, avec **plafonds par famille** (≤35 pts critiques, ≤20 majeures, ≤15 modérées, ≤10 mineures) pour éviter qu'un seul type d'erreur n'écrase tout. `Score = max(0, 100 − Σ pénalités)`, traduit en niveaux Excellent ≥90 / Bon ≥75 / Moyen ≥50 / Faible <50.

## ⚠️ Limites de l'audit automatisé

Un outil automatique ne couvre qu'**~30–40 %** des critères WCAG — c'est vrai d'axe-core comme d'A11y Lens. Limites assumées :

- **Faux négatifs** : beaucoup de problèmes (logique de focus, sens des alternatives textuelles, structure sémantique profonde, formulaires dynamiques) exigent une revue humaine.
- **Contraste approximatif** : estimation par remontée des ancêtres avec indice de confiance ; non géré : images de fond derrière le texte, dégradés, `mix-blend-mode`, canvas, pseudo-éléments, `hsl()`/`var()` non résolus. Une confiance basse est signalée « à vérifier manuellement », jamais affirmée.
- **Nom accessible calculé** : algorithme simplifié (attributs + contenu textuel), pas l'implémentation complète de l'arbre d'accessibilité du navigateur.
- **SPA / iframes / shadow DOM** : non audités au MVP ; le DOM est analysé à l'instant T (un rendu asynchrone post-audit n'est pas vu).
- **Pages protégées** : certains sites bloquent l'injection de scripts ; l'extension l'indique clairement plutôt que d'échouer silencieusement.

## 🧪 Tests

```bash
npm test                  # ~200 tests, 12 fichiers
npx vitest run --coverage # couverture v8 (~86 % lignes sur src/)
```

Stratégie : règles testées sur fixtures HTML en jsdom/happy-dom (cas positifs **et** négatifs), moteur testé avec règles volontairement crashantes (isolation des erreurs), utilitaires couleur validés contre les ratios WCAG de référence (21:1 noir/blanc, ≈4.48:1 `#777`/blanc…), exports vérifiés RFC 4180 + BOM + injection Excel, UI testée par machine à états (aria-busy, garde anti double-clic), manifest validé par tests (MV3, permissions minimales, absence de `host_permissions`/`content_scripts`).

## 🔑 Choix techniques importants

| Choix                                                          | Raisonnement                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CRXJS Vite Plugin écarté**                                   | Incompatibilité de version stable avec Vite 5 et optimisé pour les content scripts déclaratifs permanents — contraire à la contrainte « injection à la demande ». Un script Node dédié génère le manifest : source de vérité **typée et testée**. |
| **`activeTab` + `scripting`, zéro `host_permissions`**         | Moindre surface d'attaque, installation sans alerte « lire/toutes les données », consentement utilisateur implicite à chaque audit.                                                                                                               |
| **Audit injecté sous forme de fonction pure** (`func:` + args) | Aucun fichier JS à charger dans la page cible, sortie `structuredClone`-compatible exigée par MV3, moteur testable hors navigateur.                                                                                                               |
| **Contrat unique `AuditRule`**                                 | Ajout de règle = 1 fichier + 1 ligne de registre ; tolérance aux crashs (une règle en erreur n'annule pas l'audit, tracé `status:'error'`).                                                                                                       |
| **Vanilla TS plutôt que React**                                | Popup légère (<20 Ko de JS applicatif), temps de démarrage quasi nul, pas de dépendance de runtime — pertinent pour une UI à 4 états.                                                                                                             |
| **Rendu DOM sans `innerHTML`**                                 | Les extraits HTML proviennent de pages tierces : insertion systématique en `textContent` (sécurité XSS dans la popup).                                                                                                                            |
| **CSV : une ligne par occurrence**                             | Exploitable dans un tableur pour tri/statistiques ; colonnes stables `ruleId, severity, message, selector, recommendation…`.                                                                                                                      |
| **Score à plafonds par sévérité**                              | Un score purement linéaire serait dominé par la règle la plus bavarde ; les plafonds gardent le chiffre « défendable » dans un rapport.                                                                                                           |

## 📦 Publication Chrome Web Store — assets nécessaires

À produire avant soumission (hors code) :

- **Icône du store 128×128 px** (PNG) — ✅ générée (`src/assets/icons/icon-128.png`, depuis `scripts/icon.svg`)
- **Image promotionnaire 1280×800 px** (PNG/JPEG) — à créer (capture de la popup avec résultats + accroche)
- **Captures d'écran** : jusqu'à 5 images, recommandé ≥ 1280 px de large — à créer : popup état vide, popup avec rapport, carte de problème dépliée, page d'options, export CSV
- **Description** : courte (≤132 caractères) + longue (≤16 000) — rédigées partiellement dans `scripts/manifest.config.mjs`
- **Catégorie** : Productivity / Web Development ; **visibilité** : publique ou non listée
- **Politique de confidentialité** : page déclarant « aucune donnée collectée/transmise » (l'extension est 100 % locale) + lien si vous en hébergez une
- **Justification des permissions** : formulaire CWS — `activeTab` (audit de l'onglet actif à la demande), `scripting` (injection ponctuelle), `storage` (préférences locales)
- **Compte développeur CWS** : 5 $ une fois
- Artefact : `npm run package` → `release/a11y-lens-<version>.zip` (manifest.json à la racine de l'archive)

## 🗺️ Prochaines améliorations

- Détection des zones `aria-live`, `role` invalides, tableaux de données sans `<th scope>`, légendes vidéo
- Audit des iframes et shadow DOM (open) ; re-déclenchement sur mutations (mode « surveillance » optionnel)
- Algorithme complet de nom accessible (accname) et arbre d'accessibilité
- Historique des audits par site + comparaison dans le temps
- Rapport HTML autonome partageable ; badges « score » à intégrer au CI
- i18n de l'extension (EN) via `_locales` ; règles personnalisées par l'utilisateur
- Version Firefox (MV3 quasi compatible) ; éventuel retour à CRXJS si un HMR complet devient nécessaire

## 🎓 Ce que ce projet m'a appris

- **Manifest V3 en pratique** : limites du modèle `executeScript({ func })` (fonctions sérialisables, args/sorties `structuredClone`-compatibles, pas de closures) et pourquoi `activeTab` change le modèle de permission.
- **Architecture orientée contrat** : figer une interface de règle _avant_ d'écrire les règles a rendu chacune des 13 détections trivial à ajouter, tester et désactiver.
- **Le contraste est un problème d'ingénierie, pas de maths** : composition alpha, héritage, aplatissement — et surtout savoir renvoyer « je ne sais pas » (indice de confiance) plutôt qu'un faux positif.
- **Tester une extension sans navigateur** : isoler le moteur (DOM simulé) du pont chrome.* (mocké) permet ~200 tests en 10 s ; l'UI se teste par machine à états.
- **L'accessibilité de l'outil d'accessibilité** : live regions, focus visibles, `<details>` natifs, contrastes vérifiés — dogfooding constant.
- **L'UX du doute** : un score n'est pas une vérité ; afficher sévérités, occurrences et limites de confiance rend le rapport crédible et actionnable.

---

## 📄 Licence

MIT — utilisez, copiez, auditez librement.
