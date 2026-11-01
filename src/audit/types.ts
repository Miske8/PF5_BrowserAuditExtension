/**
 * Types du moteur d'audit (Étape 5) et du registre de règles.
 *
 * Ces types décrivent ce que le moteur PRODUIT à partir des RuleResult des
 * règles : une sortie consolidée, plate, ordonnée et sérialisable, prête à
 * être :
 *  - retournée à la popup via chrome.scripting.executeScript (Résultat d'injection),
 *  - transformée en rapport + score (core/report, Étape 8),
 *  - exportée JSON/CSV (services/exporter, Étape 11).
 */

import type { AuditIssue, PageMeta } from '../types';
import type { AuditRule } from '../rules/rule';

/** Statut d'exécution d'une règle dans un run donné. */
export type RuleRunStatus = 'pass' | 'fail' | 'skipped' | 'error';

/** Trace d'exécution par règle — utile pour le debug et l'affichage "règles vérifiées". */
export interface RuleRunTrace {
  ruleId: string;
  title: string;
  severity: AuditRule['severity'];
  category: AuditRule['category'];
  status: RuleRunStatus;
  /** Nombre d'issues produites (0 si pass/skipped/error). */
  issueCount: number;
  /** Raison si skipped (ex: règle désactivée par l'utilisateur). */
  reason?: string;
}

/** Erreur technique rencontrée pendant l'audit (non bloquante pour les autres règles). */
export interface AuditErrorEntry {
  ruleId: string;
  message: string;
}

/** Sortie brute du moteur d'audit, exécuté dans le contexte de la page. */
export interface RawAuditOutput {
  /** Issues normalisées, triées par sévérité décroissante puis ruleId. */
  issues: AuditIssue[];
  /** Métadonnées de la page auditée. */
  page: PageMeta;
  /** Traces d'exécution (une entrée par règle connue du registre). */
  traces: RuleRunTrace[];
  /** Erreurs techniques levées par certaines règles (les autres ont tourné). */
  errors: AuditErrorEntry[];
  /** Horodatage ISO du run. */
  ranAt: string;
  /** Durée d'exécution en ms (mesurée côté page). */
  durationMs: number;
}

/** Résultat d'un audit au niveau service/popup (Étapes 5 & 9). */
export type AuditRunResult =
  /** Succès : rapport complet prêt à être affiché/exporté (Étape 8). */
  | { ok: true; report: import('./report-builder').A11yReport }
  | { ok: false; code: AuditFailureCode; message: string };

/** Codes d'échec d'un audit — gérés dans l'UI (Étape 12). */
export type AuditFailureCode =
  /** Page non analysable : chrome://, edge://, about:, web store, PDF viewer… */
  | 'UNSUPPORTED_PAGE'
  /** L'extension n'a pas accès à l'onglet (ex: incognito sans autorisation). */
  | 'NO_TAB_ACCESS'
  /** L'onglet cible est en cours de chargement ou mort. */
  | 'TAB_UNAVAILABLE'
  /** Injection ou exécution de la fonction d'audit a échoué. */
  | 'INJECTION_FAILED'
  /** La page ne contient aucun document exploitable (iframe sandbox, etc.). */
  | 'EMPTY_DOCUMENT'
  /** Erreur inattendue. */
  | 'UNKNOWN';
