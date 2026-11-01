/**
 * Calcul du score global A11y Lens (Étape 8).
 *
 * Philosophie : un score SIMPLE, LISIBLE et DÉFENDABLE.
 *  - Sur 100, comme Lighthouse, pour que tout le monde comprenne.
 *  - Pondération par sévérité uniquement (poids issus de core/severity.ts :
 *    critique = 4, majeur = 2, modéré = 1, mineur = 0.5), multipliée par le
 *    nombre d'occurrences agrégées dans chaque issue.
 *  - Formule à plafonds par sévérité (esprit Lighthouse/axe) :
 *      perte = poids(sévérité) × occurrences agrégées, saturée par un
 *      plafond par famille : critique ≤ 35 pts, majeur ≤ 30, modéré ≤ 20,
 *      mineur ≤ 10.
 *      score = max(0, 100 − somme des pertes plafonnées)
 *    Exemple défendable : 2 images sans alt (critiques) + 1 lien sans nom
 *    (majeur) ⇒ 2×4 + 1×2 = 10 pts de perte ⇒ score 90. Le plafond évite
 *    qu'une page avec 200 images sans alt tombe mécaniquement à 0 : la
 *    pénalité sature (« au-delà de 9 problèmes critiques, le diagnostic ne
 *    peut pas être plus négatif »), ce qui est exactement le comportement
 *    attendu d'un audit de conformité.
 *  - Le résultat expose le détail (pertes par sévérité, total pondéré,
 *    occurrences) pour que le score soit explicable dans un portfolio.
 *
 * Aucun accès réseau, aucune dépendance UI : fonction pure testable.
 */

import type { AuditIssue, Severity } from '../types';
import { SEVERITY_WEIGHTS } from '../core/severity';

/** Résultat complet du scoring — consommé par le rapport, l'UI et les exports. */
export interface ScoreResult {
  /** Score arrondi à l'entier, borné [0, 100]. */
  score: number;
  /** Niveau de conformité global dérivé du score (badge couleur dans l'UI). */
  level: ScoreLevel;
  /** Points totaux perdus (100 − score exact avant arrondi). */
  penalty: number;
  /** Détail de la pénalité par sévérité (avant plafond appliqué). */
  penaltiesBySeverity: Record<Severity, number>;
  /** Poids total cumulé des occurrences (critique×4 + majeur×2…). */
  weightedTotal: number;
  /** Nombre total d'occurrences (issues groupées décomposées). */
  totalOccurrences: number;
}

/** Niveaux affichés dans la popup (Étapes 9-10). */
export type ScoreLevel = 'excellent' | 'good' | 'average' | 'poor';

/** Plafond de perte par sévérité (points sur 100). */
const PENALTY_CAPS: Record<Severity, number> = {
  critical: 35,
  major: 30,
  moderate: 20,
  minor: 10,
};

/**
 * Compte les occurrences réelles d'une issue : une même règle peut regrouper
 * plusieurs éléments sous une seule carte UI (`elements: [...]`).
 * Défaut : 1 (les absences globales type `<html lang>` n'ont pas d'éléments).
 */
export function countOccurrences(issue: AuditIssue): number {
  if (typeof issue.occurrences === 'number' && Number.isFinite(issue.occurrences)) {
    return Math.max(0, Math.floor(issue.occurrences));
  }
  return issue.elements.length > 0 ? issue.elements.length : 1;
}

/** Dérive le niveau qualitatif depuis le score numérique. */
export function scoreLevel(score: number): ScoreLevel {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'average';
  return 'poor';
}

/** Libellés français des niveaux de score (popup + CSV). */
export const SCORE_LEVEL_LABELS_FR: Record<ScoreLevel, string> = {
  excellent: 'Excellent',
  good: 'Bon',
  average: 'Moyen',
  poor: 'Faible',
};

/**
 * Calcule le score depuis les issues consolidées du moteur.
 * `issues` vides ⇒ score parfait 100.
 */
export function computeScore(issues: readonly AuditIssue[]): ScoreResult {
  let weightedTotal = 0;
  let totalOccurrences = 0;
  const weightedBySeverity: Record<Severity, number> = {
    critical: 0,
    major: 0,
    moderate: 0,
    minor: 0,
  };

  for (const issue of issues) {
    const occurrences = countOccurrences(issue);
    totalOccurrences += occurrences;
    const weight = SEVERITY_WEIGHTS[issue.severity] ?? 1;
    weightedTotal += occurrences * weight;
    weightedBySeverity[issue.severity] += occurrences * weight;
  }

  // Pénalité brute par sévérité, puis application du plafond.
  const rawPenalties: Record<Severity, number> = {
    critical: weightedBySeverity.critical, // 1 occ. critique = 4 pts
    major: weightedBySeverity.major,
    moderate: weightedBySeverity.moderate,
    minor: weightedBySeverity.minor,
  };
  const penaltiesBySeverity: Record<Severity, number> = {
    critical: Math.min(PENALTY_CAPS.critical, rawPenalties.critical),
    major: Math.min(PENALTY_CAPS.major, rawPenalties.major),
    moderate: Math.min(PENALTY_CAPS.moderate, rawPenalties.moderate),
    minor: Math.min(PENALTY_CAPS.minor, rawPenalties.minor),
  };

  const penalty =
    penaltiesBySeverity.critical +
    penaltiesBySeverity.major +
    penaltiesBySeverity.moderate +
    penaltiesBySeverity.minor;

  const exact = Math.max(0, 100 - penalty);
  const score = Math.round(exact);

  return {
    score,
    level: scoreLevel(score),
    penalty: Math.round(penalty * 100) / 100,
    penaltiesBySeverity,
    weightedTotal: Math.round(weightedTotal * 100) / 100,
    totalOccurrences,
  };
}
