/**
 * Registre des règles d'audit — point d'extension unique (Étape 4).
 *
 * Ajouter une nouvelle règle = créer un fichier dans src/audit/rules/ qui
 * exporte une `AuditRule` via `defineRule`, puis l'ajouter à la liste ci-dessous.
 * Le moteur d'audit (Étape 5) itère sur `getRules()` sans rien connaître
 * d'autre : aucune condition métier ne doit jamais atterrir dans le moteur.
 */

import type { AuditRule } from '../rules/rule';
import { imageAltRule } from './rules/image-alt';
import { buttonNameRule } from './rules/button-name';
import { linkNameRule } from './rules/link-name';
import { labelRule } from './rules/label';
import { formFieldNameRule } from './rules/form-field-name';
import { headingOrderRule } from './rules/heading-order';
import { htmlLangRule } from './rules/html-lang';
import { pageTitleRule } from './rules/page-title';
import { tabindexPositiveRule } from './rules/tabindex-positive';
import { ariaHiddenFocusableRule } from './rules/aria-hidden-focusable';
import { duplicateIdRule } from './rules/duplicate-id';
import { landmarksRule } from './rules/landmarks';
import { colorContrastRule } from './rules/color-contrast';

/**
 * Liste des règles actives. L'ordre de ce tableau est aussi l'ordre de passage
 * par défaut du moteur (l'affichage UI re-trie ensuite par sévérité).
 */
const RULES: AuditRule[] = [
  // Étape 6 : règles structurelles (12)
  imageAltRule,
  buttonNameRule,
  linkNameRule,
  labelRule,
  formFieldNameRule,
  headingOrderRule,
  htmlLangRule,
  pageTitleRule,
  tabindexPositiveRule,
  ariaHiddenFocusableRule,
  duplicateIdRule,
  landmarksRule,
  // Étape 7 : règle de contraste (estimation fond + confiance)
  colorContrastRule,
];

/** Retourne une copie défensive pour éviter toute mutation externe du registre. */
export function getRules(): readonly AuditRule[] {
  return [...RULES];
}

/** Retrouve une règle par id (utile options UI Étape 13, tests). */
export function getRuleById(id: string): AuditRule | undefined {
  return RULES.find((rule) => rule.id === id);
}

/** Ids connus — validation des préférences `disabledRules` (Étape 13). */
export function getRuleIds(): string[] {
  return RULES.map((rule) => rule.id);
}
