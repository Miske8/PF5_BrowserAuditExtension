/**
 * Registre des règles d'audit — point d'extension unique (Étape 4).
 *
 * Ajouter une nouvelle règle = créer un fichier dans src/audit/rules/ qui
 * exporte une `AuditRule` via `defineRule`, puis l'ajouter à la liste ci-dessous.
 * Le moteur d'audit (Étape 5) itère sur `getRules()` sans rien connaître
 * d'autre : aucune condition métier ne doit jamais atterrir dans le moteur.
 */

import type { AuditRule } from '../rules/rule';

/**
 * Liste des règles actives. Peuplée aux Étapes 6-7 (13 règles MVP).
 * L'ordre de ce tableau est aussi l'ordre de passage par défaut du moteur.
 */
const RULES: AuditRule[] = [
  // Étape 6 : règles structurelles (image-alt, button-name, link-name, label…)
  // Étape 7 : règle de contraste (color-contrast)
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
