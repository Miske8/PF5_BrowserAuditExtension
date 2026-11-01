/**
 * Utilitaires de sévérité (Étapes 5 & 8).
 *
 * Source unique de vérité pour :
 *  - l'ordre de tri des problèmes (moteur d'audit),
 *  - le libellé français affiché dans la popup (Étapes 9-10),
 *  - les poids utilisés par le calcul du score (Étape 8, core/score.ts).
 */

import type { Severity } from '../types';

/** Ordre décroissant de gravité — aussi l'ordre d'affichage par défaut. */
export const SEVERITY_ORDER: readonly Severity[] = [
  'critical',
  'major',
  'moderate',
  'minor',
];

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  major: 1,
  moderate: 2,
  minor: 3,
};

/** Poids de pénalité par sévérité (utilisés par le score, Étape 8). */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 4,
  major: 2,
  moderate: 1,
  minor: 0.5,
};

/** Rang de tri d'une sévérité (plus petit = plus grave). */
export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity];
}

/** Compare deux sévérités pour `Array.prototype.sort` (gravité décroissante). */
export function compareBySeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

/** Libellés français stables (popup + exports CSV/JSON). */
export const SEVERITY_LABELS_FR: Record<Severity, string> = {
  critical: 'Critique',
  major: 'Majeur',
  moderate: 'Modéré',
  minor: 'Mineur',
};

/** Garde-fou typé : normalise une chaîne inconnue en 'moderate' (jamais de crash). */
export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && value in SEVERITY_RANK;
}
