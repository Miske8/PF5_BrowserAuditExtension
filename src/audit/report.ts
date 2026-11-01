/**
 * Modèle de rapport intermédiaire (Étape 5).
 *
 * ⚠️ Le rapport FINAL (score global, compteurs par sévérité, niveau A/B/AA…)
 * sera produit à l'Étape 8 dans `src/core/report.ts` à partir de ces
 * agrégats. Ce module ne fait que préparer des données consolidées et
 * immuables, prêtes à afficher (Étapes 9-10) et à exporter (Étape 11).
 *
 * Rôle : transformer un `RawAuditOutput` du moteur en agrégats légers :
 *  - compteurs d'issues par sévérité ;
 *  - récapitulatif par règle (statut + nb d'occurrences) ;
 *  - détection « page sans problèmes » ;
 *  - formatage FR pour l'affichage (durée, date).
 */

import type { AuditIssue, Severity } from '../types';
import type { RawAuditOutput, RuleRunTrace } from './types';
import { SEVERITY_LABELS_FR, SEVERITY_ORDER } from '../core/severity';

/** Compteurs d'occurrences par sévérité (toujours complets, zéros inclus). */
export type SeverityCounts = Record<Severity, number>;

/** Récapitulatif d'une règle après exécution (pour l'UI « règles vérifiées »). */
export interface RuleSummary {
  ruleId: string;
  title: string;
  severity: Severity;
  status: RuleRunTrace['status'];
  issueCount: number;
}

/** Agrégats légers calculés depuis une sortie moteur. */
export interface AuditAggregates {
  totalIssues: number;
  countsBySeverity: SeverityCounts;
  rulesSummaries: RuleSummary[];
  /** Nombre de règles réellement exécutées (pass + fail + error). */
  executedRules: number;
  /** Nombre de règles ignorées (désactivées). */
  skippedRules: number;
  /** true si aucun problème détecté (et qu'au moins une règle a tourné). */
  cleanPage: boolean;
  /** true si au moins une règle s'est terminée en erreur technique. */
  hasRuleErrors: boolean;
}

/** Compte les occurrences par sévérité (tableau toujours complet). */
export function countBySeverity(issues: readonly AuditIssue[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, major: 0, moderate: 0, minor: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  return counts;
}

/** Construit les agrégats consolidés d'une sortie moteur. */
export function buildAggregates(output: RawAuditOutput): AuditAggregates {
  const countsBySeverity = countBySeverity(output.issues);
  const totalIssues = output.issues.length;

  let executedRules = 0;
  let skippedRules = 0;
  const rulesSummaries: RuleSummary[] = output.traces.map((trace) => {
    if (trace.status === 'skipped') skippedRules += 1;
    else executedRules += 1;
    return {
      ruleId: trace.ruleId,
      title: trace.title,
      severity: trace.severity,
      status: trace.status,
      issueCount: trace.issueCount,
    };
  });

  return {
    totalIssues,
    countsBySeverity,
    rulesSummaries,
    executedRules,
    skippedRules,
    cleanPage: totalIssues === 0 && executedRules > 0,
    hasRuleErrors: output.errors.length > 0,
  };
}

/** Formatage FR de la durée : "12 ms" / "1,4 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/** Formatage FR de l'horodatage ISO : date + heure lisibles. */
export function formatRanAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

/** Libellé français d'une sévérité ("critical" -> "Critique"). */
export function severityLabel(severity: Severity): string {
  return SEVERITY_LABELS_FR[severity];
}

/** Itère les sévérités par gravité décroissante (ordre d'affichage UI). */
export function severitiesOrdered(): readonly Severity[] {
  return SEVERITY_ORDER;
}
